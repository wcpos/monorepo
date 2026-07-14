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
	type WooProductPayload,
} from '@wcpos/sync-core';

import { type Materialized, materializeTargeted } from '../materialization/record-materialization';
import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';
import {
	parseProductBrowseWindowLimit,
	PRODUCT_BROWSE_WINDOW_ORDER,
	PRODUCT_BROWSE_WINDOW_ORDERBY,
} from './product-browse-window-descriptor';
import {
	assertReturnedRequestedIds,
	chunk,
	type CollectionSchedulerCoverageRepository,
	type Fetcher,
	httpGet,
	recordCoverage,
} from './rx-scheduler-collection-fetcher';

import type { FetchTask, FetchTaskResult } from './replication-policy';
import type { ExistenceManifestDocument } from '../local-coverage/existence-manifest-schema';
import type { SchedulerFetcher, SchedulerFetcherContext } from './replication-scheduler';

export type ProductSchedulerRepository = {
	// Accepts the STORED shape (promoted filter/sort columns attached at the call sites via
	// withProductColumns) so every stored product is queryable by the indexed columns.
	upsertMany(documents: StoredProductDocument[]): Promise<void>;
};

export type ProductSchedulerCoverageRepository = CollectionSchedulerCoverageRepository;

export type ProductsSchedulerFetcherInput = {
	baseUrl: string;
	repository: ProductSchedulerRepository;
	fetcher?: Fetcher;
	coverageRepository?: ProductSchedulerCoverageRepository;
	coverageFreshForMs?: number;
	nowMs?: () => number;
	/**
	 * Leg-3 manifest sink (ADR 0014): receives the `{wooId, digest}` rows extracted from each pulled
	 * batch (from the server-attached `_rxdb_digest`). Optional — omitted by the playground/tests, wired
	 * to db.existenceManifest by the bootstrap. When present, the digest is also stripped from the payload.
	 */
	manifestSink?: (rows: ExistenceManifestDocument[]) => Promise<void>;
};

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

function taskLimit(task: FetchTask): number {
	if (!Number.isSafeInteger(task.limit) || task.limit <= 0) {
		throw new Error('Product scheduler task limit must be a positive integer');
	}
	return Math.min(task.limit, WOO_REST_MAX_PER_PAGE);
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
	const batchSize = taskLimit(task);
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
		await persistProductDocuments(input, documents);
		fetchedDocumentIds.push(
			...documents.map(({ storedDocument }) => coverageRecordId(storedDocument as ProductDocument))
		);
		documentCount += documents.length;
		requestCount += 1;
	}

	await recordCoverage('products', input, task, fetchedDocumentIds, true);

	return { taskId: task.id, documentCount, requestCount, completed: true };
}

async function fetchProductQuery(
	input: ProductsSchedulerFetcherInput,
	query: URLSearchParams,
	context?: SchedulerFetcherContext
): Promise<WooProductPayload[]> {
	const url = `${input.baseUrl}/products?${query.toString()}`;
	const response = await httpGet(input, url, context);
	if (!response.ok) {
		throw new Error(`Woo REST product search request failed: ${response.status}`);
	}
	return JSON.parse(await response.text()) as WooProductPayload[];
}

function productSearchParams(search: string, limit: number): URLSearchParams {
	const query = new URLSearchParams();
	query.set('search', search);
	query.set('per_page', String(limit));
	query.set('page', '1');
	query.set('orderby', 'id');
	query.set('order', 'desc');
	return query;
}

function productSkuParams(sku: string, limit: number): URLSearchParams {
	const query = new URLSearchParams();
	query.set('sku', sku);
	query.set('per_page', String(limit));
	query.set('page', '1');
	query.set('orderby', 'id');
	query.set('order', 'desc');
	return query;
}

function uniqueProductPayloads(payloads: WooProductPayload[]): WooProductPayload[] {
	const byId = new Map<number, WooProductPayload>();
	for (const payload of payloads) {
		const id = Number(payload.id);
		if (!byId.has(id)) byId.set(id, payload);
	}
	return [...byId.values()];
}

/**
 * The products browse-window seed (ADR 0027 §2): ONE bounded first page over the servable
 * set the existing product paths already request, sorted by the POS default catalog sort
 * (orderby=title&order=asc). No filters, no remote pagination — a cold-grid seed, not a
 * query engine. Reuses fetchProductQuery + productDocumentFromWooPayload (the shared
 * materialization path) and the shared collection repository, so the #637 pull guard
 * (withoutLocallyProtected) protects a locally-dirty product from the window refresh.
 */
async function fetchProductBrowseWindow(
	input: ProductsSchedulerFetcherInput,
	task: FetchTask,
	limit: number,
	context?: SchedulerFetcherContext
): Promise<FetchTaskResult> {
	const query = new URLSearchParams();
	query.set('per_page', String(limit));
	query.set('page', '1');
	query.set('orderby', PRODUCT_BROWSE_WINDOW_ORDERBY);
	query.set('order', PRODUCT_BROWSE_WINDOW_ORDER);
	const payloads = await fetchProductQuery(input, query, context);
	const documents = payloads.slice(0, limit).map(productDocumentFromWooPayload);
	await persistProductDocuments(input, documents);
	// A page below the window ceiling means the servable set is exhausted (complete);
	// a full page means there is more the seed deliberately does not walk (incomplete).
	const complete = payloads.length < limit;
	await recordCoverage(
		'products',
		input,
		task,
		documents.map(({ storedDocument }) => coverageRecordId(storedDocument as ProductDocument)),
		complete
	);

	return { taskId: task.id, documentCount: documents.length, requestCount: 1, completed: complete };
}

async function fetchProductSearch(
	input: ProductsSchedulerFetcherInput,
	task: FetchTask,
	search: string,
	context?: SchedulerFetcherContext
): Promise<FetchTaskResult> {
	const limit = taskLimit(task);
	const searchPayloads = await fetchProductQuery(
		input,
		productSearchParams(search, limit),
		context
	);
	const skuPayloads = await fetchProductQuery(input, productSkuParams(search, limit), context);
	const payloads = uniqueProductPayloads([...skuPayloads, ...searchPayloads]);
	const documents = payloads.slice(0, limit).map(productDocumentFromWooPayload);
	await persistProductDocuments(input, documents);
	const complete = searchPayloads.length < limit && skuPayloads.length < limit;
	await recordCoverage(
		'products',
		input,
		task,
		documents.map(({ storedDocument }) => coverageRecordId(storedDocument as ProductDocument)),
		complete
	);

	return { taskId: task.id, documentCount: documents.length, requestCount: 2, completed: complete };
}

export function createProductsSchedulerFetcher(
	input: ProductsSchedulerFetcherInput
): SchedulerFetcher {
	return async (task: FetchTask, context?: SchedulerFetcherContext): Promise<FetchTaskResult> => {
		assertProductTask(task);

		if (task.ids && task.ids.length > 0) {
			return fetchTargetedProducts(input, task, context);
		}

		const browseWindowLimit = parseProductBrowseWindowLimit(task.queryKey);
		if (browseWindowLimit !== null) {
			return fetchProductBrowseWindow(input, task, browseWindowLimit, context);
		}

		const search = productSearchTerm(task);
		if (search !== null) {
			return fetchProductSearch(input, task, search, context);
		}

		throw new Error(`Product scheduler task queryKey is not supported: ${task.queryKey}`);
	};
}
