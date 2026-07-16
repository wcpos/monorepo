/**
 * The deep, generic scheduler-fetcher core that the per-collection fetchers share. Each collection supplies
 * only its delta via a spec (endpoint, payload→document mapping, the two id-space functions, optional prune);
 * this module owns the verbatim scaffolding that was copied across the collection fetchers: pagination, coverage
 * recording, the abort-signal http-guard, and the per-task accumulation maps.
 *
 * MASS-DELETE GUARD (P0-1, load-bearing — see ADR 0008/0009): a document has TWO ids in DIFFERENT id-spaces,
 * accumulated SEPARATELY:
 *   - storageId(doc)        = the stable STORAGE key (the uuid _woocommerce_pos_uuid for uuid'd collections;
 *                             woo-<thing>:<id> for the G1 tax exception). The deletion-prune kept-set lives here.
 *   - coverageRecordId(doc) = the Woo-id-space key (woo-<thing>:<wooId>) so lane/targeted matching agrees;
 *                             a born-local doc (no wooId) falls through to its storage id.
 * Conflating them post-emit-flip silently prunes EVERY server-sourced doc on each greedy refresh. The generic
 * keeps two arrays and feeds the prune ONLY storageIds and coverage ONLY coverageIds.
 */

import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';
import { chunk } from './chunk';
import { pullRequestLimit } from './replication-policy';

import type { BuildCoverageDocumentsFromQueryResultInput } from './query-coverage-writes';
import type { FetchTask, FetchTaskResult } from './replication-policy';
import type { SchedulerFetcher, SchedulerFetcherContext } from './replication-scheduler';

export const DEFAULT_COVERAGE_FRESH_FOR_MS = 5 * 60 * 1_000;

export type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export type CollectionRepository<Doc> = {
	upsertMany(documents: Doc[]): Promise<void>;
	/**
	 * Optional set-difference deletion. A greedy refresh fetches the COMPLETE authoritative set, so any
	 * server-sourced local doc absent from it was deleted upstream and must be tombstoned (the upsert-only refresh
	 * never prunes). Called ONLY on the terminal page, with the STORAGE ids (uuid) accumulated across every page —
	 * they must match the stored doc.id the prune compares. Locally-born unpushed docs are left untouched.
	 */
	pruneServerSourcedAbsent?(keptStorageIds: readonly string[]): Promise<string[]>;
};

export type CollectionSchedulerCoverageRepository = {
	recordQueryResult(input: BuildCoverageDocumentsFromQueryResultInput): Promise<void>;
};

export type CollectionSchedulerInput<Doc> = {
	baseUrl: string;
	repository: CollectionRepository<Doc>;
	fetcher?: Fetcher;
	coverageRepository?: CollectionSchedulerCoverageRepository;
	coverageFreshForMs?: number;
	nowMs?: () => number;
	pullBatchSize?: () => number | undefined;
};

/** The per-collection delta for a GREEDY (paginate-the-whole-set) collection — reference + tax. */
export type GreedyCollectionSpec<Doc, Payload> = {
	/** Scheduler collection name, e.g. 'taxRates' | 'categories'. */
	collection: string;
	/** The greedy lane queryKey, e.g. 'taxRates:all' | 'categories:all'. */
	greedyQueryKey: string;
	/** Resource path under the sync namespace (no leading slash), e.g. 'taxes' | 'products/categories'. */
	endpoint: string;
	/** payload → local document. Owns the uuid-or-not choice (identifyRecord for uuid'd collections; woo-id key for the G1 tax exception). */
	documentFromPayload: (payload: Payload) => Doc;
	/** The STORAGE key for the prune kept-set (document.id). */
	storageId: (document: Doc) => string;
	/** The Woo-id-space COVERAGE id (== storageId for the single-id-space tax exception). */
	coverageRecordId: (document: Doc) => string;
	/**
	 * Whether this collection participates in set-difference deletion. When true the result ALWAYS reports
	 * `prunedCount` (0 when the repository implements no prune or none ran), and the prune runs on the terminal
	 * page if the repository implements it. When false/omitted (the G1 tax exception) the result omits prunedCount
	 * entirely and no prune ever runs — matching each collection's pre-consolidation result shape.
	 */
	prunable?: boolean;
};

function assertGreedyTask(
	spec: { collection: string; greedyQueryKey: string },
	task: FetchTask
): void {
	if (task.collection !== spec.collection) {
		throw new Error(`${spec.collection} scheduler fetcher cannot run ${task.collection} tasks`);
	}
	if (task.queryKey !== spec.greedyQueryKey) {
		throw new Error(
			`${spec.collection} scheduler task queryKey is not supported: ${task.queryKey}`
		);
	}
	if (!Number.isSafeInteger(task.limit) || task.limit <= 0) {
		throw new Error(`${spec.collection} scheduler task limit must be a positive integer`);
	}
}

export async function httpGet(
	input: { fetcher?: Fetcher },
	url: string,
	context: SchedulerFetcherContext | undefined
): Promise<Response> {
	const fetcher = input.fetcher ?? fetch;
	// Thread the abort signal only when present, so the default request shape is unchanged.
	return context?.signal ? fetcher(url, { signal: context.signal }) : fetcher(url);
}

/** Record one query-result coverage entry (no-op when no coverage repository is wired). Shared scaffolding. */
export async function recordCoverage(
	collection: string,
	input: CollectionSchedulerInput<unknown>,
	task: FetchTask,
	coverageRecordIds: readonly string[],
	complete: boolean
): Promise<void> {
	if (!input.coverageRepository) return;
	await input.coverageRepository.recordQueryResult({
		collection,
		queryKey: task.queryKey,
		records: coverageRecordIds.map((id) => ({ id })),
		complete,
		nowMs: input.nowMs?.() ?? Date.now(),
		freshForMs: input.coverageFreshForMs ?? DEFAULT_COVERAGE_FRESH_FOR_MS,
	});
}
export { chunk };

/**
 * Greedy fetcher: page through the whole authoritative set (per_page/page/orderby=id asc), upsert each page,
 * record coverage by the Woo-id-space ids, and on the terminal page prune server-sourced docs absent from the
 * complete set. `prunedCount` is included in the result only when the repository supports pruning.
 */
export function createGreedyCollectionFetcher<Doc, Payload>(
	spec: GreedyCollectionSpec<Doc, Payload>,
	input: CollectionSchedulerInput<Doc>
): SchedulerFetcher {
	const fetchedStorageIdsByTask = new Map<string, string[]>(); // STORAGE ids (uuid) — for the deletion prune
	const fetchedCoverageIdsByTask = new Map<string, string[]>(); // Woo-id-space ids — for coverage
	const nextPageByTask = new Map<string, number>();

	return async (task: FetchTask, context?: SchedulerFetcherContext): Promise<FetchTaskResult> => {
		assertGreedyTask(spec, task);
		const perPage = Math.min(pullRequestLimit(task, input.pullBatchSize), WOO_REST_MAX_PER_PAGE);
		const page = nextPageByTask.get(task.id) ?? 1;
		const query = new URLSearchParams();
		query.set('per_page', String(perPage));
		query.set('page', String(page));
		query.set('orderby', 'id');
		query.set('order', 'asc');

		const url = `${input.baseUrl}/${spec.endpoint}?${query.toString()}`;
		const response = await httpGet(input, url, context);
		if (!response.ok)
			throw new Error(`Woo REST ${spec.collection} request failed: ${response.status}`);

		const payloads = JSON.parse(await response.text()) as Payload[];
		const documents = payloads.map(spec.documentFromPayload);
		await input.repository.upsertMany(documents);

		// TWO id-spaces, accumulated SEPARATELY across pages (mass-delete guard — see module header).
		const allStorageIds = [
			...(fetchedStorageIdsByTask.get(task.id) ?? []),
			...documents.map(spec.storageId),
		];
		fetchedStorageIdsByTask.set(task.id, allStorageIds);
		const allCoverageIds = [
			...(fetchedCoverageIdsByTask.get(task.id) ?? []),
			...documents.map(spec.coverageRecordId),
		];
		fetchedCoverageIdsByTask.set(task.id, allCoverageIds);

		nextPageByTask.set(task.id, page + 1);
		const completed = payloads.length < perPage;

		await recordCoverage(spec.collection, input, task, allCoverageIds, completed);

		// Only prunable collections prune — a non-prunable (G1 tax) collection never runs a prune even if a repo
		// somehow implements one, and never reports prunedCount.
		const prunes = spec.prunable ? input.repository.pruneServerSourcedAbsent : undefined;
		let prunedCount = 0;
		if (completed) {
			// Skip the prune on abort so a torn-down refresh can't tombstone against a partial set. keptDocumentIds
			// are STORAGE keys (uuid) — they must match the stored doc.id the prune compares.
			if (prunes && context?.signal?.aborted !== true) {
				prunedCount = (await prunes(allStorageIds)).length;
			}
			fetchedStorageIdsByTask.delete(task.id);
			fetchedCoverageIdsByTask.delete(task.id);
			nextPageByTask.delete(task.id);
		}

		// Report prunedCount iff this collection is prunable (tax/G1 omits it — matching its prior result shape).
		return spec.prunable
			? {
					taskId: task.id,
					documentCount: documents.length,
					requestCount: 1,
					completed,
					prunedCount,
				}
			: { taskId: task.id, documentCount: documents.length, requestCount: 1, completed };
	};
}

/** A targeted-fetch target parsed from a document id: its canonical storage id + the Woo id (null = born-local sentinel). */
export type CollectionTarget = { documentId: string; wooId: number | null };

/**
 * The per-collection delta for an ON-DEMAND (targeted-by-id OR search-windowed) collection — customer, product.
 * These are NOT greedy: a task either names ids (targeted include= fetch) or carries a search lane queryKey.
 * There is no prune and a single coverage id-space (targeted/search never tombstone), so only coverageRecordId
 * is needed — but it still returns the Woo-id-space id so the lane's expectedRecordIds match.
 */
export type TargetedSearchCollectionSpec<Doc, Payload> = {
	/** Scheduler collection name, e.g. 'customers' | 'products'. */
	collection: string;
	/** Resource path under the sync namespace (no leading slash), e.g. 'customers' | 'products'. */
	endpoint: string;
	/** Capitalised label for "{label} scheduler ..." error messages, e.g. 'Customer'. */
	label: string;
	/** Lower-case label for "Woo REST {restLabel} ..." error messages, e.g. 'customer'. */
	restLabel: string;
	/** payload → local document (owns the uuid identity choice). */
	documentFromPayload: (payload: Payload) => Doc;
	/** The Woo-id-space COVERAGE id (born-local sentinels fall through to their storage id). */
	coverageRecordId: (document: Doc) => string;
	/** The Woo id carried by a payload (for verifying a targeted include= response returned everything requested). */
	payloadWooId: (payload: Payload) => number;
	/** Parse a targeted task document id → its target (wooId null for a born-local sentinel like customer:default). */
	targetFromId: (id: string) => CollectionTarget;
	/** Build the partial born-local document for a sentinel target (e.g. customer:default) — stored without a request. */
	defaultDocument: (target: CollectionTarget) => Doc;
	/** Parse a search-lane queryKey → { search, queryLimit }, or null when the queryKey is not a search lane. */
	parseSearchQuery: (task: FetchTask) => { search: string; queryLimit: number } | null;
};

function assertPositiveLimit(label: string, task: FetchTask): void {
	if (!Number.isSafeInteger(task.limit) || task.limit <= 0) {
		throw new Error(`${label} scheduler task limit must be a positive integer`);
	}
}

export function assertReturnedRequestedIds<Payload>(
	spec: { restLabel: string; payloadWooId: (payload: Payload) => number },
	idsBatch: number[],
	payloads: Payload[]
): void {
	const returnedIds = new Set(payloads.map(spec.payloadWooId));
	const missingIds = idsBatch.filter((id) => !returnedIds.has(id));
	if (missingIds.length > 0) {
		throw new Error(
			`Woo REST targeted ${spec.restLabel} response missing requested ${spec.restLabel} ids: ${missingIds.join(', ')}`
		);
	}
}

async function fetchTargeted<Doc, Payload>(
	spec: TargetedSearchCollectionSpec<Doc, Payload>,
	input: CollectionSchedulerInput<Doc>,
	task: FetchTask,
	context: SchedulerFetcherContext | undefined
): Promise<FetchTaskResult> {
	assertPositiveLimit(spec.label, task);
	const targets = (task.ids ?? []).map(spec.targetFromId);
	const defaultDocuments = targets
		.filter((target) => target.wooId === null)
		.map(spec.defaultDocument);
	const ids = targets.map((target) => target.wooId).filter((id): id is number => id !== null);
	const batchSize = Math.min(pullRequestLimit(task, input.pullBatchSize), WOO_REST_MAX_PER_PAGE);
	let documentCount = 0;
	let requestCount = 0;
	const fetchedCoverageIds: string[] = [];

	// Born-local sentinels (e.g. customer:default) are stored directly — no Woo include= request (requestCount stays 0).
	if (defaultDocuments.length > 0) {
		await input.repository.upsertMany(defaultDocuments);
		fetchedCoverageIds.push(...defaultDocuments.map(spec.coverageRecordId));
		documentCount += defaultDocuments.length;
	}

	for (const idsBatch of chunk(ids, batchSize)) {
		const query = new URLSearchParams();
		query.set('include', idsBatch.join(','));
		query.set('per_page', String(idsBatch.length));
		query.set('orderby', 'include');
		const url = `${input.baseUrl}/${spec.endpoint}?${query.toString()}`;
		const response = await httpGet(input, url, context);
		if (!response.ok)
			throw new Error(`Woo REST targeted ${spec.restLabel} request failed: ${response.status}`);
		const payloads = JSON.parse(await response.text()) as Payload[];
		assertReturnedRequestedIds(spec, idsBatch, payloads);
		const documents = payloads.map(spec.documentFromPayload);
		await input.repository.upsertMany(documents);
		fetchedCoverageIds.push(...documents.map(spec.coverageRecordId));
		documentCount += documents.length;
		requestCount += 1;
	}

	await recordCoverage(spec.collection, input, task, fetchedCoverageIds, true);
	return { taskId: task.id, documentCount, requestCount, completed: true };
}

async function fetchSearch<Doc, Payload>(
	spec: TargetedSearchCollectionSpec<Doc, Payload>,
	input: CollectionSchedulerInput<Doc>,
	task: FetchTask,
	search: string,
	context: SchedulerFetcherContext | undefined
): Promise<FetchTaskResult> {
	assertPositiveLimit(spec.label, task);
	let documentCount = 0;
	let requestCount = 0;
	let exhausted = false;
	const fetchedCoverageIds: string[] = [];
	const perPage = Math.min(pullRequestLimit(task, input.pullBatchSize), WOO_REST_MAX_PER_PAGE);

	while (documentCount < task.limit) {
		const remaining = task.limit - documentCount;
		const query = new URLSearchParams();
		if (search) query.set('search', search);
		query.set('per_page', String(perPage));
		query.set('page', String(requestCount + 1));
		query.set('orderby', 'id');
		query.set('order', 'desc');
		const url = `${input.baseUrl}/${spec.endpoint}?${query.toString()}`;
		const response = await httpGet(input, url, context);
		if (!response.ok)
			throw new Error(`Woo REST ${spec.restLabel} search request failed: ${response.status}`);

		const payloads = JSON.parse(await response.text()) as Payload[];
		const documents = payloads.slice(0, remaining).map(spec.documentFromPayload);
		await input.repository.upsertMany(documents);
		fetchedCoverageIds.push(...documents.map(spec.coverageRecordId));
		documentCount += documents.length;
		requestCount += 1;

		if (payloads.length < perPage) {
			// Mark complete only when the short page wasn't truncated by the task limit (otherwise more may remain).
			exhausted = payloads.length <= remaining;
			break;
		}
	}

	await recordCoverage(spec.collection, input, task, fetchedCoverageIds, exhausted);
	return { taskId: task.id, documentCount, requestCount, completed: true };
}

/**
 * On-demand fetcher: dispatch a task either to a targeted include= fetch (when it names ids) or to a search-windowed
 * paginate (when its queryKey is a search lane). Shares the http-guard + coverage scaffolding with the greedy core.
 */
export function createTargetedSearchCollectionFetcher<Doc, Payload>(
	spec: TargetedSearchCollectionSpec<Doc, Payload>,
	input: CollectionSchedulerInput<Doc>
): SchedulerFetcher {
	return async (task: FetchTask, context?: SchedulerFetcherContext): Promise<FetchTaskResult> => {
		if (task.collection !== spec.collection) {
			throw new Error(`${spec.label} scheduler fetcher cannot run ${task.collection} tasks`);
		}
		if (task.ids && task.ids.length > 0) return fetchTargeted(spec, input, task, context);
		const parsedSearch = spec.parseSearchQuery(task);
		if (parsedSearch !== null) {
			if (parsedSearch.queryLimit !== task.limit) {
				throw new Error(
					`${spec.label} scheduler task limit does not match queryKey limit: ${task.queryKey}`
				);
			}
			return fetchSearch(spec, input, task, parsedSearch.search, context);
		}
		throw new Error(`${spec.label} scheduler task queryKey is not supported: ${task.queryKey}`);
	};
}
