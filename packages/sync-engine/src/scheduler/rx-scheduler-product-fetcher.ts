/**
 * Product scheduler fetcher. Unlike customer, product does NOT collapse into the thin targeted/search spec:
 * its search runs a dual search=+sku= query with dedupe (not paginated), its targeted ids come from the explicit
 * numeric wooIds channel, it promotes indexed columns via withProductColumns before upsert, and it has no
 * born-local sentinel. So it keeps its own targeted/search flow but reuses the shared scaffolding helpers
 * (httpGet / recordCoverage / chunk / assertReturnedRequestedIds) — no copied pagination/coverage boilerplate.
 */

import {
	type ProductDocument,
	productDocumentId,
	type StoredProductDocument,
	type SyncObserver,
	type WooProductPayload,
} from '@wcpos/sync-core';

import { type Materialized, materializeTargeted } from '../materialization/record-materialization';
import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';
import {
	parseProductBrowseWindowDescriptor,
	PRODUCT_BROWSE_WINDOW_ORDER,
	PRODUCT_BROWSE_WINDOW_ORDERBY,
	type ProductBrowseWindowDescriptor,
} from './product-browse-window-descriptor';
import {
	assertReturnedRequestedIds,
	chunk,
	type CollectionSchedulerCoverageRepository,
	type Fetcher,
	httpGet,
	recordCoverage,
} from './rx-scheduler-collection-fetcher';
// prettier-ignore
import { type FetchTask, type FetchTaskResult, pullRequestLimit, type SchedulerFetcher, type SchedulerFetcherContext } from './replication-policy';

import type { ExistenceManifestDocument } from '../local-coverage/existence-manifest-schema';

export type ProductSchedulerRepository = {
	// Accepts the STORED shape (promoted filter/sort columns attached at the call sites via
	// withProductColumns) so every stored product is queryable by the indexed columns.
	upsertMany(documents: StoredProductDocument[]): Promise<void>;
	removeMany(documents: StoredProductDocument[]): Promise<void>;
};

export type ProductSchedulerCoverageRepository = CollectionSchedulerCoverageRepository;

export type ProductsSchedulerFetcherInput = {
	baseUrl: string;
	repository: ProductSchedulerRepository;
	fetcher?: Fetcher;
	diagnostics?: SyncObserver;
	coverageRepository?: ProductSchedulerCoverageRepository;
	coverageFreshForMs?: number;
	nowMs?: () => number;
	pullBatchSize?: () => number | undefined;
	/**
	 * Leg-3 manifest sink (ADR 0014): receives the `{wooId, digest}` rows extracted from each pulled
	 * batch (from the server-attached `_rxdb_digest`). Optional — omitted by the playground/tests, wired
	 * to db.existenceManifest by the bootstrap. When present, the digest is also stripped from the payload.
	 */
	manifestSink?: (rows: ExistenceManifestDocument[]) => Promise<void>;
};

/**
 * Extra PAGES the browse-window walk may scan past a filled window to resolve the
 * menu_order/id tiebreak (see fetchProductBrowseWindow). Denominated in pages, not
 * records, so a gentler Performance dial also scans fewer records — an unresolved
 * boundary reports `product.browse-window.approximate` rather than paging forever.
 */
export const PRODUCT_BROWSE_WINDOW_MAX_TIEBREAK_PAGES = 19;
/** Keep equal to FLEXSEARCH_MIN_TERM_LENGTH in packages/query/src/engine-query.ts. */
const FLEXSEARCH_MIN_TERM_LENGTH = 3;

/** Store a pulled product batch: extract the Leg-3 manifest rows, strip `_rxdb_digest`, upsert both. */
async function persistProductDocuments(
	input: ProductsSchedulerFetcherInput,
	records: Materialized<Record<string, unknown>>[]
): Promise<void> {
	await input.repository.upsertMany(
		records.map(({ storedDocument }) => storedDocument as StoredProductDocument)
	);
	const manifestRows = records.flatMap(({ manifestRow }) => (manifestRow ? [manifestRow] : []));
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
	payload: WooProductPayload
): Materialized<Record<string, unknown>> {
	return materializeTargeted('products', payload);
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
	// The numeric server ids travel ONLY on the explicit wooIds channel — decoupled from the document-key
	// encoding (storage keys are uuids since the P0-1 emit-flip, so the server id is unrecoverable from the
	// key). Every targeted seeder populates it (seedTargetedLane); a targeted task without it is a contract
	// violation, not something to fall back from.
	if (!task.wooIds || task.wooIds.length === 0) {
		throw new Error(`Targeted product scheduler task is missing its wooIds channel: ${task.id}`);
	}
	return task.wooIds;
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
	return document.wooProductId === null ? document.id : productDocumentId(document.wooProductId);
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
		const payloads = JSON.parse(await response.text()) as WooProductPayload[];
		assertReturnedRequestedIds(
			{ restLabel: 'product', payloadWooId: (payload: WooProductPayload) => Number(payload.id) },
			idsBatch,
			payloads
		);
		const documents = payloads.map(productDocumentFromWooPayload);
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

async function fetchProductQuery(
	input: ProductsSchedulerFetcherInput,
	query: URLSearchParams,
	context?: SchedulerFetcherContext
): Promise<{ payloads: WooProductPayload[]; totalPages: number | null }> {
	const url = `${input.baseUrl}/products?${query.toString()}`;
	const response = await httpGet(input, url, context);
	if (!response.ok) {
		throw new Error(`Woo REST product search request failed: ${response.status}`);
	}
	return {
		payloads: JSON.parse(await response.text()) as WooProductPayload[],
		totalPages: Number(response.headers.get('X-WP-TotalPages')) || null,
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
	context?: SchedulerFetcherContext
): Promise<{ payloads: WooProductPayload[]; requestCount: number; exhausted: boolean }> {
	const payloads: WooProductPayload[] = [];
	let requestCount = 0;
	let exhausted = false;
	// Page size is fixed for the whole walk: Woo's offset is (page-1)*per_page, so
	// shrinking the final page would re-read earlier rows and drop the true tail.
	// A limit below the dial still costs only one small page (single-page walks
	// have no offset to corrupt); anything above walks at the dial and trims locally.
	const pageSize = Math.min(perPage, limit);
	while (payloads.length < limit) {
		const page = await fetchProductQuery(input, params(pageSize, requestCount + 1), context);
		requestCount += 1;
		payloads.push(...page.payloads);
		if (page.payloads.length < pageSize) {
			exhausted = true;
			break;
		}
	}
	return { payloads: payloads.slice(0, limit), requestCount, exhausted };
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
 * The products browse-window seed (ADR 0027 §2): a bounded window over the servable set,
 * sorted by the window descriptor's sort — the POS default catalog sort (menu_order ASC,
 * id ASC, #810) unless the grid asked for another Woo-expressible column (#909).
 *
 * TWO INDEPENDENT SIZES (#908). `descriptor.limit` is the WINDOW — how many rows the grid
 * seeds. `pageSize` is the WIRE page — `per_page` on each request, governed by the
 * Performance dial. The window is walked in ceil(limit / pageSize) pages, so a 100-row
 * window at pullBatchSize=25 costs four polite requests instead of one heavy one. No
 * request ever asks for more than the dial allows.
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
	context?: SchedulerFetcherContext
): Promise<FetchTaskResult> {
	const { limit } = descriptor;
	const isDefaultSort =
		descriptor.orderby === PRODUCT_BROWSE_WINDOW_ORDERBY &&
		descriptor.order === PRODUCT_BROWSE_WINDOW_ORDER;
	const query = new URLSearchParams();
	query.set('per_page', String(pageSize));
	query.set('orderby', descriptor.orderby);
	query.set('order', descriptor.order);
	query.set('status', 'publish');
	for (const field of ['category', 'tag', 'brand'] as const) {
		if (descriptor[field]) query.set(field, descriptor[field].join(','));
	}
	for (const field of ['featured', 'on_sale'] as const) {
		if (descriptor[field] !== undefined) query.set(field, String(descriptor[field]));
	}
	if (descriptor.stock_status) query.set('stock_status', descriptor.stock_status);

	const windowPages = Math.ceil(limit / pageSize);
	let payloads: WooProductPayload[] = [];
	let pagePayloads: WooProductPayload[] = [];
	let totalPages: number | null = null;
	let requestCount = 0;

	// Phase 1 — fill the window: ceil(limit / pageSize) pages at the dial's page size.
	while (requestCount < windowPages) {
		query.set('page', String(requestCount + 1));
		const page = await fetchProductQuery(input, query, context);
		requestCount += 1;
		pagePayloads = page.payloads;
		totalPages = page.totalPages ?? totalPages;
		payloads = payloads.concat(pagePayloads);
		if (pagePayloads.length < pageSize) break; // server exhausted before the window filled
		// A result set that is an exact multiple of pageSize never yields a short page, so a
		// short page alone cannot detect exhaustion: without this the walk asks for one page
		// past the last, which WP answers with `rest_..._invalid_page_number` (a 400) and
		// fetchProductQuery turns into a thrown, failed browse. Phase 2 already respects the
		// advertised last page; phase 1 must too. Same class as the orders fix in 35be526ed —
		// pre-filters this needed a catalog sized to an exact page multiple, but a FILTERED
		// window lands on small exact counts routinely.
		if (totalPages !== null && requestCount >= totalPages) break;
	}
	if (isDefaultSort) payloads = payloads.sort(compareMenuOrderPayloads);
	payloads = payloads.slice(0, limit);

	// Phase 2 — resolve the id tiebreak at the window's boundary (default sort only).
	const boundaryMenuOrder =
		isDefaultSort && payloads.length === limit && pagePayloads.length === pageSize
			? Number(payloads[payloads.length - 1]?.menu_order ?? 0)
			: null;
	const stillOnBoundary = (): boolean =>
		boundaryMenuOrder !== null &&
		pagePayloads.length === pageSize &&
		(totalPages === null || requestCount < totalPages) &&
		Number(pagePayloads[pagePayloads.length - 1]?.menu_order ?? 0) === boundaryMenuOrder;

	let tiebreakPages = 0;
	while (tiebreakPages < PRODUCT_BROWSE_WINDOW_MAX_TIEBREAK_PAGES && stillOnBoundary()) {
		query.set('page', String(requestCount + 1));
		const nextPage = await fetchProductQuery(input, query, context);
		requestCount += 1;
		tiebreakPages += 1;
		pagePayloads = nextPage.payloads;
		totalPages = nextPage.totalPages ?? totalPages;
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
	const documents = windowPayloads.map(productDocumentFromWooPayload);
	await persistProductDocuments(input, documents);
	await recordCoverage(
		'products',
		input,
		task,
		documents.map(({ storedDocument }) => coverageRecordId(storedDocument as ProductDocument)),
		brandsHonored
	);

	return { taskId: task.id, documentCount: documents.length, requestCount, completed: true };
}

async function fetchProductSearch(
	input: ProductsSchedulerFetcherInput,
	task: FetchTask,
	search: string,
	context?: SchedulerFetcherContext
): Promise<FetchTaskResult> {
	// The dial governs the WIRE page, not the result set (#908): each leg still wants
	// `limit` records, it just walks them in dial-sized pages instead of asking for the
	// whole set in one heavy request. Capping per_page WITHOUT paginating would truncate
	// search results, which is why this used to opt out of the dial entirely.
	const limit = taskLimit(task);
	const pageSize = taskLimit(task, input.pullBatchSize);
	const term = search.trim();
	const searchLeg =
		term.length < FLEXSEARCH_MIN_TERM_LENGTH
			? null
			: await fetchProductSearchLeg(
					input,
					(perPage, page) => productSearchParams(term, perPage, page),
					limit,
					pageSize,
					context
				);
	const skuLeg = await fetchProductSearchLeg(
		input,
		(perPage, page) => productSkuParams(term, perPage, page),
		limit,
		pageSize,
		context
	);
	const payloads = uniqueProductPayloads([...skuLeg.payloads, ...(searchLeg?.payloads ?? [])]);
	const documents = payloads.slice(0, limit).map(productDocumentFromWooPayload);
	await persistProductDocuments(input, documents);
	// A skipped short-term search leg counts as exhausted; otherwise both legs must exhaust.
	// The slice above can drop deduped cross-leg hits past the window, and the products
	// lane key carries no limit — a truncated persist must not record a complete lane,
	// or the serve-local gate would answer a later, larger-limit search from the
	// truncated set.
	const complete = (searchLeg?.exhausted ?? true) && skuLeg.exhausted && payloads.length <= limit;
	await recordCoverage(
		'products',
		input,
		task,
		documents.map(({ storedDocument }) => coverageRecordId(storedDocument as ProductDocument)),
		complete
	);

	return {
		taskId: task.id,
		documentCount: documents.length,
		requestCount: (searchLeg?.requestCount ?? 0) + skuLeg.requestCount,
		completed: complete,
	};
}

export function createProductsSchedulerFetcher(
	input: ProductsSchedulerFetcherInput
): SchedulerFetcher {
	return async (task: FetchTask, context?: SchedulerFetcherContext): Promise<FetchTaskResult> => {
		assertProductTask(task);

		if (task.ids && task.ids.length > 0) {
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
			return fetchProductBrowseWindow(input, task, { ...browseWindow, limit }, pageSize, context);
		}

		const search = productSearchTerm(task);
		if (search !== null) {
			return fetchProductSearch(input, task, search, context);
		}

		throw new Error(`Product scheduler task queryKey is not supported: ${task.queryKey}`);
	};
}
