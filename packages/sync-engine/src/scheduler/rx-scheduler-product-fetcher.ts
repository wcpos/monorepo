/**
 * Product scheduler fetcher. Unlike customer, product does NOT collapse into the thin targeted/search spec:
 * its search walks `search=` and conditionally adds the legacy exact `sku=` leg, its targeted ids come from the explicit
 * numeric wooIds channel, it promotes indexed columns via withProductColumns before upsert, and it has no
 * born-local sentinel. So it keeps its own targeted/search flow but reuses the shared scaffolding helpers
 * (httpGet / recordCoverage / chunk / assertReturnedRequestedIds) — no copied pagination/coverage boilerplate.
 */

import {
	type ProductDocument,
	productDocumentId,
	type StoredProductDocument,
	type SyncObserver,
	wooIdOf,
	type WooProductPayload,
} from '@wcpos/sync-core';

import {
	type BarcodeSelectors,
	barcodeSelectorsFor,
	type BarcodeSelectorsReader,
} from '../materialization/barcode-selectors';
import { manifestRowsForApplied } from '../local-coverage/existence-manifest-population';
import { type Materialized, materializeTargeted } from '../materialization/record-materialization';
import {
	BROWSE_WINDOW_MAX_PAGES_PER_DRAIN,
	type BrowseWindowContinuation,
	type BrowseWindowLaneReader,
	NO_BROWSE_WINDOW_CONTINUATION,
	readBrowseWindowContinuation,
} from './browse-window-continuation';
import { finalizeBrowseWindowLane } from './browse-window-fetcher-tail';
import {
	type BrowseWindowLaneEvictionRepository,
	productBrowseWindowLaneIdentity,
} from './browse-window-lane-eviction';
import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';
import {
	parseProductBrowseWindowDescriptor,
	PRODUCT_BROWSE_WINDOW_ORDER,
	PRODUCT_BROWSE_WINDOW_ORDERBY,
	PRODUCT_BROWSE_WINDOW_STEP,
	type ProductBrowseWindowDescriptor,
	productBrowseWindowPredecessorQueryKey,
	productBrowseWindowQueryParams,
} from './product-browse-window-descriptor';
import { type CacheQueryTotals, queryTotalFromResponse } from './query-total-requests';
import {
	assertReturnedRequestedIds,
	chunk,
	type CollectionSchedulerCoverageRepository,
	DEFAULT_COVERAGE_FRESH_FOR_MS,
	type Fetcher,
	httpGet,
	recordCoverage,
	recordCoverageRecordsOnly,
} from './rx-scheduler-collection-fetcher';
// prettier-ignore
import { type FetchTask, type FetchTaskResult, pullRequestLimit, type SchedulerFetcher, type SchedulerFetcherContext } from './replication-policy';

import type { BuildCumulativeCoverageDocumentsFromQueryResultInput } from './query-coverage-writes';
import type { ExistenceManifestDocument } from '../local-coverage/existence-manifest-schema';

export type ProductSchedulerRepository = {
	// Accepts the STORED shape (promoted filter/sort columns attached at the call sites via
	// withProductColumns) so every stored product is queryable by the indexed columns.
	upsertMany(documents: StoredProductDocument[]): Promise<readonly StoredProductDocument[] | void>;
	removeMany(documents: StoredProductDocument[]): Promise<void>;
};

export type ProductSchedulerCoverageRepository = CollectionSchedulerCoverageRepository &
	BrowseWindowLaneEvictionRepository & {
		/**
		 * Optional lane read used by the browse-window CONTINUATION (#948): it tells the walk
		 * how much of this window is already covered so growing 200 → 300 fetches one page
		 * instead of three. Optional so a host without coverage still gets a correct (just
		 * un-resumed) full walk.
		 */
		readLocalLaneCoverage?: BrowseWindowLaneReader;
		recordCumulativeQueryResult?(
			input: BuildCumulativeCoverageDocumentsFromQueryResultInput
		): Promise<void>;
	};

export type ProductsSchedulerFetcherInput = {
	baseUrl: string;
	repository: ProductSchedulerRepository;
	fetcher?: Fetcher;
	diagnostics?: SyncObserver;
	coverageRepository?: ProductSchedulerCoverageRepository;
	coverageFreshForMs?: number;
	nowMs?: () => number;
	pullBatchSize?: () => number | undefined;
	cacheQueryTotals?: CacheQueryTotals;
	/**
	 * Leg-3 manifest sink (ADR 0014): receives the `{wooId, digest}` rows extracted from each pulled
	 * batch (from the server-attached `_rxdb_digest`). Optional — omitted by tests, wired
	 * to db.existenceManifest by the bootstrap. When present, the digest is also stripped from the payload.
	 */
	manifestSink?: (rows: ExistenceManifestDocument[]) => Promise<void>;
	/**
	 * The ONE browse-window lane key an explicitly user-driven sync (the grid's `sync()`)
	 * is refreshing. Only THAT window re-walks from page 1 instead of resuming from its
	 * covered prefix; every other queued window keeps its continuation.
	 */
	refreshBrowseWindowKey?: string;
	/** LIVE read of the active scope's barcode carriers — products materialize
	 * `payload.barcode` from them. A reader, not a value: a browse walk spans
	 * many pages and a config poll can change the carrier mid-walk. */
	barcodeSelectors?: BarcodeSelectorsReader;
	/** Live capability gate for the legacy exact `sku=` search leg. */
	exactSkuLeg?: () => boolean;
};

/**
 * Extra PAGES the browse-window walk may scan past a filled window to resolve the
 * menu_order/id tiebreak (see fetchProductBrowseWindow). Denominated in pages, not
 * records, so a gentler Performance dial also scans fewer records — an unresolved
 * boundary reports `product.browse-window.approximate` rather than paging forever.
 */
export const PRODUCT_BROWSE_WINDOW_MAX_TIEBREAK_PAGES = 19;

/** Store a pulled product batch: extract the Leg-3 manifest rows, strip `_rxdb_digest`, upsert both. */
async function persistProductDocuments(
	input: ProductsSchedulerFetcherInput,
	records: Materialized<Record<string, unknown>>[]
): Promise<void> {
	const documents = records.map(({ storedDocument }) => storedDocument as StoredProductDocument);
	const applied = (await input.repository.upsertMany(documents)) ?? documents;
	const manifestRows = manifestRowsForApplied(records, applied);
	if (input.manifestSink && manifestRows.length > 0) {
		await input.manifestSink(manifestRows);
	}
}

function assertProductTask(task: FetchTask): void {
	if (task.collection !== 'products') {
		throw new Error(`Products scheduler fetcher cannot run ${task.collection} tasks`);
	}
}

function productDocumentFromWooPayload(
	payload: WooProductPayload,
	barcodeSelectors: BarcodeSelectors | undefined
): Materialized<Record<string, unknown>> {
	return materializeTargeted(
		'products',
		payload,
		barcodeSelectorsFor(barcodeSelectors, 'products')
	);
}

function productSearchTerm(task: FetchTask): string | null {
	const match = /^products:search:(.+)$/.exec(task.queryKey);
	if (!match) return null;
	try {
		return decodeURIComponent(match[1]);
	} catch (error) {
		if (error instanceof URIError) return match[1];
		throw error;
	}
}

function targetedProductIds(task: FetchTask): number[] {
	// Remote ids travel ONLY on the explicit remoteIds channel — decoupled from the document-key
	// encoding (storage keys are uuids since the P0-1 emit-flip, so the server id is unrecoverable from the
	// key). Every targeted seeder populates it (seedTargetedLane); a targeted task without it is a contract
	// violation, not something to fall back from.
	if (!task.remoteIds || task.remoteIds.length === 0) {
		throw new Error(`Targeted product scheduler task is missing its remoteIds channel: ${task.id}`);
	}
	return task.remoteIds.map(wooIdOf);
}

function taskLimit(task: FetchTask, pullBatchSize?: () => number | undefined): number {
	if (!Number.isSafeInteger(task.limit) || task.limit <= 0) {
		throw new Error('Product scheduler task limit must be a positive integer');
	}
	return Math.min(pullRequestLimit(task, pullBatchSize), WOO_REST_MAX_PER_PAGE);
}

/**
 * The COVERAGE-record id for a pulled product — derived from the stable numeric wooId, NOT the storage document
 * key. The P0-1 emit-flip moves the storage key to a uuid; coverage must stay wooId-keyed so the deep-link
 * coverage lookup (which builds `woo-product:<wooId>` from the numeric id) keeps matching.
 */
export function coverageRecordId(document: ProductDocument): string {
	return document.remoteId === null ? document.uuid : productDocumentId(document.remoteId);
}

async function fetchTargetedProducts(
	input: ProductsSchedulerFetcherInput,
	task: FetchTask,
	context?: SchedulerFetcherContext
): Promise<FetchTaskResult> {
	const batchSize = taskLimit(task, input.pullBatchSize);
	let documentCount = 0;
	let requestCount = 0;
	const fetchedDocumentIds: string[] = [];

	for (const idsBatch of chunk(targetedProductIds(task), batchSize)) {
		const query = new URLSearchParams();
		query.set('include', idsBatch.join(','));
		query.set('per_page', String(idsBatch.length));
		query.set('orderby', 'include');
		const url = `${input.baseUrl}/products?${query.toString()}`;
		const response = await httpGet(input, url, context);
		if (!response.ok) {
			throw new Error(`Woo REST targeted product request failed: ${response.status}`);
		}
		const payloads = (await response.json()) as WooProductPayload[];
		assertReturnedRequestedIds(
			{ restLabel: 'product', payloadWooId: (payload: WooProductPayload) => Number(payload.id) },
			idsBatch,
			payloads
		);
		const documents = payloads.map((payload) =>
			productDocumentFromWooPayload(payload, input.barcodeSelectors?.())
		);
		const published = documents.filter((_, index) => payloads[index]?.status === 'publish');
		const unpublished = documents.filter((_, index) => payloads[index]?.status !== 'publish');
		if (unpublished.length > 0) {
			await input.repository.removeMany(
				unpublished.map(({ storedDocument }) => storedDocument as StoredProductDocument)
			);
		}
		if (published.length > 0) await persistProductDocuments(input, published);
		fetchedDocumentIds.push(
			...published.map(({ storedDocument }) => coverageRecordId(storedDocument as ProductDocument))
		);
		documentCount += published.length;
		requestCount += 1;
	}

	await recordCoverage('products', input, task, fetchedDocumentIds, true);

	return { taskId: task.id, documentCount, requestCount, completed: true };
}

/** A non-2xx answer to a product query; its status and Woo code decide whether a walk may end. */
class ProductQueryHttpError extends Error {
	constructor(
		readonly status: number,
		readonly code: unknown
	) {
		super(`Woo REST product search request failed: ${status}`);
	}
}

async function fetchProductQuery(
	input: ProductsSchedulerFetcherInput,
	query: URLSearchParams,
	context?: SchedulerFetcherContext
): Promise<{
	payloads: WooProductPayload[];
	totalPages: number | null;
	totalMatchingRecords: number | null;
}> {
	const url = `${input.baseUrl}/products?${query.toString()}`;
	const response = await httpGet(input, url, context);
	if (!response.ok) {
		const error = (await response.json().catch(() => null)) as { code?: unknown } | null;
		throw new ProductQueryHttpError(response.status, error?.code);
	}
	return {
		payloads: (await response.json()) as WooProductPayload[],
		totalPages: Number(response.headers.get('X-WP-TotalPages')) || null,
		totalMatchingRecords: queryTotalFromResponse(response),
	};
}

function productSearchParams(search: string, perPage: number, page: number): URLSearchParams {
	const query = new URLSearchParams();
	query.set('search', search);
	query.set('per_page', String(perPage));
	query.set('page', String(page));
	query.set('orderby', 'id');
	query.set('order', 'desc');
	query.set('status', 'publish');
	return query;
}

function productSkuParams(sku: string, perPage: number, page: number): URLSearchParams {
	const query = new URLSearchParams();
	query.set('sku', sku);
	query.set('per_page', String(perPage));
	query.set('page', String(page));
	query.set('orderby', 'id');
	query.set('order', 'desc');
	query.set('status', 'publish');
	return query;
}

/**
 * Walk one search leg to `limit` records in `perPage` pages (#908): the dial governs the
 * WIRE page size, the leg's limit governs how many records the leg wants. Stops on a short
 * page. `exhausted` is true when the server ran out before the limit did — the caller needs
 * that to decide whether the search coverage is complete.
 */
async function fetchProductSearchLeg(
	input: ProductsSchedulerFetcherInput,
	params: (perPage: number, page: number) => URLSearchParams,
	limit: number,
	perPage: number,
	context?: SchedulerFetcherContext,
	nextPage = 1
): Promise<{ payloads: WooProductPayload[]; requestCount: number; exhausted: boolean }> {
	const payloads: WooProductPayload[] = [];
	let requestCount = 0;
	let exhausted = false;
	// Page size is fixed for the whole walk: Woo's offset is (page-1)*per_page, so
	// shrinking the final page would re-read earlier rows and drop the true tail.
	// The page is the dial even when the window is smaller (reversing #908's small-page rule):
	// one dial-sized page covers the grid's next few extensions locally, where four escalating
	// requests used to walk 12, 24, 36, 48 rows on a slow host one round trip at a time.
	const pageSize = perPage;
	// One pass walks at most the browse budget of pages; a wider window resumes on the next
	// declaration from the pages this one covered, so a huge limit never becomes one burst.
	while (payloads.length < limit && requestCount < BROWSE_WINDOW_MAX_PAGES_PER_DRAIN) {
		let page: Awaited<ReturnType<typeof fetchProductQuery>>;
		try {
			page = await fetchProductQuery(input, params(pageSize, nextPage), context);
		} catch (error) {
			// A result set that is an exact multiple of pageSize never yields a short page, so
			// the page after its last is asked for — on a resume, or when a proxy stripped the
			// X-WP-TotalPages header that would have said so. WP answers that with a 400
			// (`woocommerce_rest_product_invalid_page_number` from Woo's CRUD controller, or WP
			// core's `rest_post_invalid_page_number`): past page 1 that IS the end of the set,
			// not a failure to retry forever (PR #1935 review). Any other 400, and a 400 on
			// page 1, is a bad request — recording the prefix as complete would hide the rest.
			if (
				error instanceof ProductQueryHttpError &&
				error.status === 400 &&
				typeof error.code === 'string' &&
				/_invalid_page_number$/.test(error.code) &&
				nextPage > 1
			) {
				exhausted = true;
				break;
			}
			throw error;
		}
		requestCount += 1;
		nextPage += 1;
		payloads.push(...page.payloads);
		if (
			page.payloads.length < pageSize ||
			(page.totalPages !== null && nextPage > page.totalPages)
		) {
			exhausted = true;
			break;
		}
	}
	return { payloads, requestCount, exhausted };
}

function uniqueProductPayloads(payloads: WooProductPayload[]): WooProductPayload[] {
	const byId = new Map<number, WooProductPayload>();
	for (const payload of payloads) {
		const id = Number(payload.id);
		if (!byId.has(id)) byId.set(id, payload);
	}
	return [...byId.values()];
}

const compareMenuOrderPayloads = (left: WooProductPayload, right: WooProductPayload) =>
	Number(left.menu_order ?? 0) - Number(right.menu_order ?? 0) ||
	Number(left.id) - Number(right.id);

/**
 * Whether a returned product actually carries the `brand` dimension the descriptor asked for.
 *
 * `category`, `tag`, `featured`, `on_sale` and `stock_status` are long-standing wc/v3 core
 * product params, but `brand` filtering needs a WC version with core brands in the REST
 * controller. An older store IGNORES the param and answers with the unfiltered superset —
 * the same silent-ignore shape the orders side hit with the WCPOS proxy params, fixed there
 * by withholding lane completion (`901761cc9`).
 *
 * That superset is still worth keeping locally — they are real products — but recording it
 * as a COMPLETE lane makes `projectTotal` report the whole catalog's size as the brand-
 * filtered grid's total. Checking the records already in hand detects the old store from the
 * response itself, with no capability handshake or version probe: on a current WC every
 * returned record carries a requested brand and the lane completes exactly as before.
 */
function honorsRequestedBrands(payload: WooProductPayload, brands: number[]): boolean {
	const returned = (payload as { brands?: unknown }).brands;
	// A store whose REST controller has no brands support omits the field entirely — which is
	// itself proof it could not have applied the filter.
	if (!Array.isArray(returned)) return false;
	return returned.some(
		(brand) =>
			brand !== null &&
			typeof brand === 'object' &&
			brands.includes(Number((brand as { id?: unknown }).id))
	);
}

/**
 * The products browse window (ADR 0027 §2): the result window the grid is showing,
 * sorted by the window descriptor's sort — the POS default catalog sort (menu_order ASC,
 * id ASC, #810) unless the grid asked for another Woo-expressible column (#909).
 *
 * TWO INDEPENDENT SIZES (#908). `descriptor.limit` is the WINDOW — how many rows the grid
 * shows. `pageSize` is the WIRE page — `per_page` on each request, governed by the
 * Performance dial. No request ever asks for more than the dial allows.
 *
 * THREE INDEPENDENT SIZES, really (#948). `continuation.covered` is how much of the
 * window is ALREADY covered, from the lane the previous scroll tick wrote. The walk
 * resumes there — `page = floor(covered / pageSize) + 1`, dropping the `covered %
 * pageSize` rows of that page it already holds — so growing the window by one step costs
 * one page whether the grid sits at row 300 or row 30,000. That constant per-step cost is
 * what lets the window grow without a ceiling. The offset is denominated in RECORDS, so a
 * Performance-dial change between two steps cannot corrupt the page arithmetic.
 *
 * A resumed walk trusts the server's order across the seam rather than re-deriving it: the
 * prefix was truncated under the same sort by the walk that wrote it. For the default sort
 * that inherits the same boundary-group approximation the tiebreak walk below already
 * documents — a menu_order tie straddling the seam may resolve to either candidate.
 *
 * BOUNDARY WALK (default sort only). Woo REST cannot express the UI's `id ASC` tiebreak
 * alongside `menu_order`, and menu_order=0 is the common case, so after the window is
 * filled the fetcher keeps walking while the last page it saw still ends on the window's
 * boundary menu_order — those extra pages can contain lower ids that belong inside the
 * window. The budget is {@link PRODUCT_BROWSE_WINDOW_MAX_TIEBREAK_PAGES} extra PAGES, so a
 * gentler dial also scans fewer records; exhausting it reports an approximate window.
 * Non-default sorts need no walk: the server's own order is authoritative for them, and a
 * tie at the boundary makes either candidate equally correct.
 *
 * Reuses the shared product materialization path and repository, including the #637
 * locally-dirty pull guard.
 */
async function fetchProductBrowseWindow(
	input: ProductsSchedulerFetcherInput,
	task: FetchTask,
	descriptor: ProductBrowseWindowDescriptor,
	pageSize: number,
	continuation: BrowseWindowContinuation,
	context?: SchedulerFetcherContext
): Promise<FetchTaskResult> {
	// A RESUMED walk has two ways to be useless, and both are only detectable once it has
	// run, so both fall back to a full walk in this same pass rather than stranding the
	// window until coverage expires:
	//
	//  - **It made no progress.** The exact-fill + page-alignment gate cannot tell a
	//    positional prefix from one the phase-2 tiebreak walk SUBSTITUTED out of later wire
	//    pages. On an all-tied catalogue a 300-row lane can hold exactly 200 page-aligned
	//    ids, which passes the gate, resumes at the same offset, re-fetches the same ids and
	//    re-merges to 200 — identically, forever. Progress, not shape, is the honest test.
	//  - **Its resume page no longer exists.** Records deleted since the prefix was written
	//    can pull the listing's last page below the resume offset, and WP answers an
	//    out-of-range `page` with a 400 rather than an empty page.
	if (continuation.covered > 0) {
		const resumed = await tryProductBrowseWindowWalk(
			input,
			task,
			descriptor,
			pageSize,
			continuation,
			context
		);
		if (resumed !== null && resumed.progressed) return resumed.result;
		const full = await fetchProductBrowseWindow(
			input,
			task,
			descriptor,
			pageSize,
			NO_BROWSE_WINDOW_CONTINUATION,
			context
		);
		return {
			...full,
			// Report the wasted resume attempt honestly — it did cost requests.
			requestCount: full.requestCount + (resumed?.result.requestCount ?? 0),
		};
	}
	const walked = await tryProductBrowseWindowWalk(
		input,
		task,
		descriptor,
		pageSize,
		continuation,
		context
	);
	if (walked === null) {
		throw new Error(`Woo REST product browse-window request failed for ${task.queryKey}`);
	}
	return walked.result;
}

/**
 * One browse-window walk. Returns `null` when the walk could not run because its resume page
 * is out of range (the caller retries from the top); otherwise the result plus whether the
 * window actually grew past what the continuation already covered.
 */
async function tryProductBrowseWindowWalk(
	input: ProductsSchedulerFetcherInput,
	task: FetchTask,
	descriptor: ProductBrowseWindowDescriptor,
	pageSize: number,
	continuation: BrowseWindowContinuation,
	context?: SchedulerFetcherContext
): Promise<{ result: FetchTaskResult; progressed: boolean } | null> {
	const covered = continuation.covered;
	// Rows still owed for this window. The walk below is expressed entirely in DELTA terms
	// — `limit` here is what is left to fetch, not the window's size.
	const limit = descriptor.limit - covered;
	const isDefaultSort =
		descriptor.orderby === PRODUCT_BROWSE_WINDOW_ORDERBY &&
		descriptor.order === PRODUCT_BROWSE_WINDOW_ORDER;
	const query = new URLSearchParams();
	query.set('per_page', String(pageSize));
	// The window's sort + filters come from the ONE translator the idle catalog backfill
	// also walks by (product-browse-window-descriptor.ts), so the two lanes can never
	// express the same window as two different wire requests.
	for (const [field, value] of productBrowseWindowQueryParams(descriptor)) {
		query.set(field, value);
	}

	// Resume at the first page holding uncovered rows, dropping the rows of that page the
	// prefix already carries. Worst case one partially-wasted page per growth step —
	// cheaper than any page-cursor the lane would have to persist, and immune to the
	// Performance dial changing between steps.
	const skipInResumePage = covered % pageSize;
	let nextPageNumber = Math.floor(covered / pageSize) + 1;
	const windowPages = Math.min(
		Math.ceil((limit + skipInResumePage) / pageSize),
		BROWSE_WINDOW_MAX_PAGES_PER_DRAIN
	);
	let payloads: WooProductPayload[] = [];
	let pagePayloads: WooProductPayload[] = [];
	let totalPages: number | null = null;
	let totalMatchingRecords: number | null = null;
	let requestCount = 0;
	let serverExhausted = false;

	// Phase 1 — fill the window's uncovered tail at the dial's page size.
	while (requestCount < windowPages) {
		query.set('page', String(nextPageNumber));
		// The FIRST request of a resumed walk is the one that can be out of range: records
		// deleted since the prefix was written can pull the last page below the resume
		// offset, and WP answers that with a 400. Report it as an unusable resume so the
		// caller re-walks from the top, instead of failing the whole browse into retry
		// backoff where every attempt would re-request the same dead page.
		let page: Awaited<ReturnType<typeof fetchProductQuery>>;
		try {
			page = await fetchProductQuery(input, query, context);
		} catch (error) {
			if (requestCount === 0 && covered > 0) return null;
			throw error;
		}
		requestCount += 1;
		nextPageNumber += 1;
		pagePayloads = page.payloads;
		totalPages = page.totalPages ?? totalPages;
		totalMatchingRecords = page.totalMatchingRecords ?? totalMatchingRecords;
		payloads = payloads.concat(
			requestCount === 1 && skipInResumePage > 0
				? pagePayloads.slice(skipInResumePage)
				: pagePayloads
		);
		if (pagePayloads.length < pageSize) {
			serverExhausted = true;
			break; // server exhausted before the window filled
		}
		// A result set that is an exact multiple of pageSize never yields a short page, so a
		// short page alone cannot detect exhaustion: without this the walk asks for one page
		// past the last, which WP answers with `rest_..._invalid_page_number` (a 400) and
		// fetchProductQuery turns into a thrown, failed browse. Phase 2 already respects the
		// advertised last page; phase 1 must too. Same class as the orders fix in 35be526ed —
		// pre-filters this needed a catalog sized to an exact page multiple, but a FILTERED
		// window lands on small exact counts routinely.
		if (totalPages !== null && nextPageNumber > totalPages) {
			serverExhausted = true;
			break;
		}
	}
	if (isDefaultSort) payloads = payloads.sort(compareMenuOrderPayloads);
	payloads = payloads.slice(0, limit);
	// The per-drain page budget bit before the window filled and before the server ran out:
	// the coverage below must NOT claim a complete lane, and the next drain resumes from
	// the prefix this one leaves behind.
	const truncatedByPageBudget = !serverExhausted && payloads.length < limit;

	// Phase 2 — resolve the id tiebreak at the window's boundary (default sort only).
	const boundaryMenuOrder =
		isDefaultSort && payloads.length === limit && pagePayloads.length === pageSize
			? Number(payloads[payloads.length - 1]?.menu_order ?? 0)
			: null;
	const stillOnBoundary = (): boolean =>
		boundaryMenuOrder !== null &&
		pagePayloads.length === pageSize &&
		(totalPages === null || nextPageNumber <= totalPages) &&
		Number(pagePayloads[pagePayloads.length - 1]?.menu_order ?? 0) === boundaryMenuOrder;

	let tiebreakPages = 0;
	while (tiebreakPages < PRODUCT_BROWSE_WINDOW_MAX_TIEBREAK_PAGES && stillOnBoundary()) {
		query.set('page', String(nextPageNumber));
		const nextPage = await fetchProductQuery(input, query, context);
		requestCount += 1;
		nextPageNumber += 1;
		tiebreakPages += 1;
		pagePayloads = nextPage.payloads;
		totalPages = nextPage.totalPages ?? totalPages;
		totalMatchingRecords = nextPage.totalMatchingRecords ?? totalMatchingRecords;
		payloads = payloads.concat(pagePayloads).sort(compareMenuOrderPayloads).slice(0, limit);
	}

	if (tiebreakPages === PRODUCT_BROWSE_WINDOW_MAX_TIEBREAK_PAGES && stillOnBoundary()) {
		input.diagnostics?.({
			type: 'product.browse-window.approximate',
			level: 'warn',
			collection: 'products',
			message: `Product browse window is approximate beyond ${requestCount} scanned pages`,
		});
	}

	const windowPayloads = payloads.slice(0, limit);
	// A superset from a store that ignored `brand` must never be recorded as a COMPLETE lane
	// for this descriptor, or the grid reports the superset's size as its brand-filtered total.
	const brandsHonored =
		descriptor.brand === undefined ||
		windowPayloads.every((payload) => honorsRequestedBrands(payload, descriptor.brand!));
	if (!brandsHonored) {
		input.diagnostics?.({
			type: 'product.browse-window.brand-filter-ignored',
			level: 'warn',
			collection: 'products',
			message:
				'Store returned products outside the requested brands — brand filtering needs a WooCommerce version with core brands in the REST API; keeping the superset locally without claiming coverage',
		});
	}
	if (
		brandsHonored &&
		totalMatchingRecords !== null &&
		(descriptor.brand === undefined ||
			(serverExhausted && covered + windowPayloads.length >= totalMatchingRecords)) &&
		input.cacheQueryTotals
	) {
		// The walk records ONLY its own browse total. `census:products` has one
		// writer — the query-total lane's probe against the census route — so the
		// health page and the serve-local gate never oscillate between two
		// writers of the same key (#1400). Both now read the same wcpos/v2 lane,
		// so they also agree on the population: the census used to probe wc/v3,
		// which cannot see POS visibility and counted online-only products this
		// walk never fetches.
		await input.cacheQueryTotals({
			queryKeys: [task.queryKey],
			totalMatchingRecords,
		});
	}
	// bulkUpsert REJECTS an input carrying duplicate primary keys (COL22), which would fail
	// the whole browse after several otherwise-successful requests. The walk concatenates
	// pages verbatim, so a product inserted mid-walk — shifting every later row down a wire
	// slot and repeating one across the page boundary — is enough to trigger it, and an
	// uncapped window walks more boundaries than the old 1,000-row one ever did. Dedupe on
	// the materialized storage id, keeping the first sighting so server ordering is
	// preserved. (Same defect and remedy as the customers lane, bddd21d17.)
	const documentsById = new Map<string, Materialized<Record<string, unknown>>>();
	for (const payload of windowPayloads) {
		const document = productDocumentFromWooPayload(payload, input.barcodeSelectors?.());
		const storageId = (document.storedDocument as { uuid: string }).uuid;
		if (!documentsById.has(storageId)) documentsById.set(storageId, document);
	}
	const documents = [...documentsById.values()];
	await persistProductDocuments(input, documents);
	const deltaRecordIds = documents.map(({ storedDocument }) =>
		coverageRecordId(storedDocument as ProductDocument)
	);
	// A store that ignored `brand` returned an UNFILTERED SUPERSET. Those records are worth
	// keeping locally, but the lane must claim NO coverage for them — see `dimensionsHonored`
	// on the shared tail, which applies the same gate to the primary and demotion writes.
	const outcome = await finalizeBrowseWindowLane({
		collection: 'products',
		queryKey: task.queryKey,
		windowLimit: descriptor.limit,
		continuation,
		deltaRecordIds,
		serverExhausted,
		truncatedByPageBudget,
		dimensionsHonored: brandsHonored,
		// A products window that filled to its own size is complete even with more catalogue
		// behind it; only orders insists the server ran out.
		requireServerExhaustedForComplete: false,
		// A resumed walk that re-fetched only ids the prefix already held must NOT write its
		// lane, or it would leave a spurious short lane behind for the full re-walk to
		// overwrite a moment later.
		skipLaneWriteWithoutProgress: true,
		pageBudget: {
			message: `Product browse window paused after ${requestCount} pages with ${covered + documents.length} of ${descriptor.limit} rows covered; the next drain resumes from there`,
			emitBeforeAncestryCheck: false,
		},
		prefixInvalidatedMessage: `Product browse window ${descriptor.limit} lost the coverage it was continuing from mid-walk; restarting it from the top next pass`,
		identify: productBrowseWindowLaneIdentity,
		evictionRepository: input.coverageRepository,
		readLane: input.coverageRepository?.readLocalLaneCoverage,
		nowMs: input.nowMs?.() ?? Date.now(),
		diagnostics: input.diagnostics,
		writer: {
			recordRecordsOnly: (recordIds) =>
				recordCoverageRecordsOnly('products', input, task, recordIds),
			recordLane: ({ recordIds, complete, prefixAncestry }) =>
				recordCoverage('products', input, task, recordIds, complete, prefixAncestry),
		},
	});

	return {
		result: { taskId: task.id, documentCount: documents.length, requestCount, completed: true },
		progressed: outcome.progressed,
	};
}

async function fetchProductSearch(
	input: ProductsSchedulerFetcherInput,
	task: FetchTask,
	search: string,
	context?: SchedulerFetcherContext
): Promise<FetchTaskResult> {
	// The WINDOW is the task's limit, uncapped. It used to run through taskLimit(), which clamps
	// to the Woo per-page maximum (100) — so every grid limit past 100 walked the same two pages
	// of 50, a server with more hits than that was never exhausted, and the grid's extension
	// guard re-declared forever (26+ identical requests per search, customer report 2026-09-10).
	// The dial governs only the WIRE page.
	const limit = task.limit;
	if (!Number.isSafeInteger(limit) || limit <= 0) {
		throw new Error('Product scheduler task limit must be a positive integer');
	}
	const pageSize = Math.min(input.pullBatchSize?.() ?? 100, WOO_REST_MAX_PER_PAGE);
	const lane = await input.coverageRepository?.readLocalLaneCoverage?.(
		'products',
		task.queryKey,
		input.nowMs?.() ?? Date.now()
	);
	// Resume from the covered prefix: a fresh, incomplete lane whose id count is a whole number
	// of pages was walked at this page size, so the next page's offset is exact. Anything else
	// (stale, complete, a dial change mid-lane, a forced refresh) walks from page 1.
	const resume = Boolean(
		!task.forceRefresh &&
		lane?.fresh &&
		!lane.complete &&
		lane.expectedRecordIds &&
		lane.expectedRecordIds.length >= pageSize &&
		lane.expectedRecordIds.length % pageSize === 0 &&
		input.coverageRepository?.recordCumulativeQueryResult
	);
	const coveredIds = new Set(resume ? lane?.expectedRecordIds : []);
	const remaining = Math.max(0, limit - coveredIds.size);
	const term = search.trim();
	const exactSkuLeg = !resume && term.length > 0 && (input.exactSkuLeg?.() ?? true);
	const skuLeg = !exactSkuLeg
		? { payloads: [], requestCount: 0, exhausted: true }
		: await fetchProductSearchLeg(
				input,
				(perPage, page) => productSkuParams(term, perPage, page),
				limit,
				pageSize,
				context
			);
	const searchLeg = !term.length
		? { payloads: [], requestCount: 0, exhausted: true }
		: await fetchProductSearchLeg(
				input,
				(perPage, page) => productSearchParams(term, perPage, page),
				remaining,
				pageSize,
				context,
				coveredIds.size / pageSize + 1
			);
	// Woo answers a sku= filter from BOTH post types: a variation whose sku matches the
	// term comes back as a `type: 'variation'` row on the PRODUCTS route (WC core widens
	// post_type for sku filters; verified live on dev-pro 2026-08-20). Persisting such a
	// row here would put the variation into the PRODUCTS collection — and the barcode
	// scan reads products AND variations, so the one record would match twice and every
	// scan of that code turns falsely ambiguous ("2 products found locally"), permanently.
	// Variations are materialized only by the variations lanes; drop the rows before
	// they reach documents, counts, or coverage.
	// Dedupe sku-first so an id both legs returned keeps the exact-match copy, then split by
	// which leg carried it. Exact-sku hits that the search pages did not carry are persisted
	// and covered as RECORDS, never as lane members: the lane's id count is the search walk's
	// page cursor (a whole number of pages ⇒ resume at the next page), and one sku-only row
	// would put it off by one forever (PR #1935 review). They still lead the persisted set so
	// the exact match renders first.
	// Ids are compared as numbers on both sides, the way uniqueProductPayloads keys them.
	const searchLegIds = new Set(searchLeg.payloads.map((payload) => Number(payload.id)));
	const merged = uniqueProductPayloads([...skuLeg.payloads, ...searchLeg.payloads]).filter(
		(payload) => payload.type !== 'variation'
	);
	const searchRows = merged.filter((payload) => searchLegIds.has(Number(payload.id)));
	const skuOnlyRows = merged.filter((payload) => !searchLegIds.has(Number(payload.id)));
	const notCovered = ({ storedDocument }: Materialized<Record<string, unknown>>) =>
		!coveredIds.has(coverageRecordId(storedDocument as ProductDocument));
	const skuOnlyDocuments = skuOnlyRows
		.map((payload) => productDocumentFromWooPayload(payload, input.barcodeSelectors?.()))
		.filter(notCovered);
	const searchDocuments = searchRows
		.map((payload) => productDocumentFromWooPayload(payload, input.barcodeSelectors?.()))
		.filter(notCovered);
	const union = [...skuOnlyDocuments, ...searchDocuments];
	// Every fetched row is persisted and recorded — the window only decides how far to WALK.
	// Trimming to the window used to leave the lane covering 12, 24, 36… ids, so no later
	// declaration could resume on a page boundary or be served locally, and each extension
	// re-walked from page 1. Whole pages in the lane make the next few extensions free and
	// the one after that a single page. The lane is complete exactly when both legs ended
	// on a short page: nothing fetched is ever dropped, so nothing can hide behind the window.
	const complete = skuLeg.exhausted && searchLeg.exhausted;
	const documents = union;
	await persistProductDocuments(input, documents);
	const recordIds = searchDocuments.map(({ storedDocument }) =>
		coverageRecordId(storedDocument as ProductDocument)
	);
	await recordCoverageRecordsOnly(
		'products',
		input,
		task,
		skuOnlyDocuments.map(({ storedDocument }) =>
			coverageRecordId(storedDocument as ProductDocument)
		)
	);
	if (resume) {
		await input.coverageRepository!.recordCumulativeQueryResult!({
			collection: 'products',
			queryKey: task.queryKey,
			records: recordIds.map((id) => ({ id })),
			complete,
			nowMs: input.nowMs?.() ?? Date.now(),
			freshForMs: input.coverageFreshForMs ?? DEFAULT_COVERAGE_FRESH_FOR_MS,
		});
	} else {
		await recordCoverage('products', input, task, recordIds, complete);
	}

	return {
		taskId: task.id,
		documentCount: documents.length,
		requestCount: skuLeg.requestCount + searchLeg.requestCount,
		completed: complete,
	};
}

export function createProductsSchedulerFetcher(
	input: ProductsSchedulerFetcherInput
): SchedulerFetcher {
	return async (task: FetchTask, context?: SchedulerFetcherContext): Promise<FetchTaskResult> => {
		assertProductTask(task);

		if (task.documentIds && task.documentIds.length > 0) {
			return fetchTargetedProducts(input, task, context);
		}

		const browseWindow = parseProductBrowseWindowDescriptor(task.queryKey);
		if (browseWindow !== null) {
			// The window limit is a coverage total, not a request size — the batch dial
			// must not shrink it, or the cold product window would permanently shrink even
			// though the boundary group is exhausted before truncation. The dial governs
			// the WIRE page instead (#908), so the window is walked in dial-sized pages.
			const limit = Math.min(browseWindow.limit, task.limit);
			const pageSize = Math.min(
				pullRequestLimit({ ...task, limit }, input.pullBatchSize),
				WOO_REST_MAX_PER_PAGE
			);
			const descriptor = { ...browseWindow, limit };
			// #948: ask coverage how much of this window is already held before walking it.
			// This is what makes scrolling past the old 1,000-row ceiling affordable —
			// each extendLimit fetches its step, not the whole window again.
			const continuation = await readBrowseWindowContinuation({
				collection: 'products',
				ownQueryKey: task.queryKey,
				predecessorQueryKey: productBrowseWindowPredecessorQueryKey(descriptor),
				predecessorLimit: descriptor.limit - PRODUCT_BROWSE_WINDOW_STEP,
				limit,
				pageSize,
				nowMs: input.nowMs?.() ?? Date.now(),
				readLane: input.coverageRepository?.readLocalLaneCoverage,
				forceRefresh: input.refreshBrowseWindowKey === task.queryKey,
			});
			if (continuation.satisfied) {
				// Fresh, complete coverage for this exact window: serve local. Deliberately
				// NO coverage rewrite — the lane must keep its own expiry so the window is
				// still re-walked periodically instead of being pinned fresh forever.
				return { taskId: task.id, documentCount: 0, requestCount: 0, completed: true };
			}
			return fetchProductBrowseWindow(input, task, descriptor, pageSize, continuation, context);
		}

		const search = productSearchTerm(task);
		if (search !== null) {
			return fetchProductSearch(input, task, search, context);
		}

		throw new Error(`Product scheduler task queryKey is not supported: ${task.queryKey}`);
	};
}
