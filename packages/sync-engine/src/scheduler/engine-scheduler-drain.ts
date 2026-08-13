import { assertBulkSuccess } from '@wcpos/sync-core';
import type { SyncObserver } from '@wcpos/sync-core';
/** The persisted scheduler drain for apps/main. One context serves every supported
 * collection; this module owns the registry and its task-support predicates. */

import {
	ledgerRebuiltSchedulerTaskRunnerResult,
	type PersistedSchedulerTaskRunnerResult,
	runPersistedSchedulerTasks,
} from './rx-scheduler-task-runner';
import {
	withLedgerRecovery,
	withSchedulerDrainLedgerRecovery,
} from '../local-coverage/ledger-storage-recovery';
import {
	RxSchedulerTaskStateRepository,
	type SchedulerTaskStateDatabase,
} from './rx-scheduler-task-state-repository';
import {
	createSchedulerFetcherRegistry,
	type SchedulerTaskSupportCandidate,
} from './scheduler-fetcher-registry';
import { createOrdersSchedulerFetcher } from './rx-scheduler-order-fetcher';
import { createProductsSchedulerFetcher } from './rx-scheduler-product-fetcher';
import { createVariationsSchedulerFetcher } from './rx-scheduler-variation-fetcher';
import { createCustomerSchedulerFetcher } from './rx-scheduler-customer-fetcher';
import { CUSTOMER_BROWSE_WINDOW_GRAMMAR } from './customer-browse-window-descriptor';
import { RxQueryTotalCacheRepository } from '../collections/rx-query-total-cache-repository';
import { createTaxRateSchedulerFetcher } from './rx-scheduler-tax-rate-fetcher';
import {
	BRAND_REFERENCE_CONFIG,
	CATEGORY_REFERENCE_CONFIG,
	COUPON_REFERENCE_CONFIG,
	createReferenceCollectionFetcher,
	TAG_REFERENCE_CONFIG,
} from './rx-scheduler-reference-fetcher';
import { referenceCollectionRepository } from '../collections/rx-reference-collection-repository';
import { createOrderPendingMutationIds } from '../write-path/order-pull-guard';
import { hasPendingLocalWork, withoutLocallyProtected } from '../write-path/local-work-guard';
import { withCustomerManifestPopulation } from '../local-coverage/existence-manifest-population';
import {
	type ManifestCollection,
	upsertManifestRows,
} from '../local-coverage/rx-existence-manifest-repository';
import {
	EngineOrderRepository,
	type OrderRepositoryDatabase,
} from '../write-path/engine-order-repository';
import { ORDER_BROWSE_WINDOW_GRAMMAR } from './order-browser-scheduler-descriptor';
import { PRODUCT_BROWSE_WINDOW_GRAMMAR } from './product-browse-window-descriptor';
import { censusCollectionFromQueryKey } from './census';
import { type CacheQueryTotals, QUERY_TOTAL_FRESH_FOR_MS } from './query-total-requests';

import type { BarcodeSelectorsReader } from '../materialization/barcode-selectors';
import type { LocalCoverage } from '../local-coverage/local-coverage';
import type { FetchTask, FetchTaskResult } from './replication-policy';

export const ORDER_SCHEDULER_LEASE_FOR_MS = 30 * 1_000;
export const ORDER_SCHEDULER_RETRY_AFTER_MS = 30 * 1_000;
export const ORDER_SCHEDULER_MAX_REQUESTS = 100;
export const ORDER_SCHEDULER_COVERAGE_FRESH_FOR_MS = 5 * 60 * 1_000;

// ---------------------------------------------------------------------------
// Task-support predicates (verbatim from the web syncCollectionRegistry)
// ---------------------------------------------------------------------------

const SUPPORTED_ORDER_QUERY_KEY = 'orders:custom-pull';
const SUPPORTED_TARGETED_ORDER_QUERY_KEY_PREFIX = 'orders:ids:';
const SUPPORTED_TARGETED_PRODUCT_QUERY_KEY_PREFIX = 'products:ids:';
const SUPPORTED_PRODUCT_SEARCH_QUERY_KEY_PATTERN = /^products:search:.+$/;
const SUPPORTED_VARIATION_SEARCH_QUERY_KEY_PATTERN = /^variations:search:.+$/;
// All three browse predicates ask the same question of the same shared grammar: does this
// key parse as this lane's browse window? (browse-window-grammar.ts)
const isSupportedProductBrowseWindowQueryKey = (queryKey: string): boolean =>
	PRODUCT_BROWSE_WINDOW_GRAMMAR.parse(queryKey) !== null;
const SUPPORTED_TARGETED_CUSTOMER_QUERY_KEY_PREFIX = 'customers:ids:';
const SUPPORTED_CUSTOMER_SEARCH_QUERY_KEY_PATTERN = /^customers:search=([^:]*):limit=(\d+)$/;
const SUPPORTED_TAX_RATE_QUERY_KEY = 'taxRates:all';

function hasNoTargetedIds(task: SchedulerTaskSupportCandidate): boolean {
	return !task.ids || task.ids.length === 0;
}

function hasTargetedIds(task: SchedulerTaskSupportCandidate): boolean {
	return !!task.ids && task.ids.length > 0;
}

function isSupportedBrowserOrderQueryKey(queryKey: string): boolean {
	return ORDER_BROWSE_WINDOW_GRAMMAR.parse(queryKey) !== null;
}

function isSupportedOrderSchedulerTask(task: SchedulerTaskSupportCandidate): boolean {
	if (task.collection !== 'orders') return false;
	if (task.queryKey === SUPPORTED_ORDER_QUERY_KEY && hasNoTargetedIds(task)) return true;
	if (task.queryKey.startsWith(SUPPORTED_TARGETED_ORDER_QUERY_KEY_PREFIX)) {
		return hasTargetedIds(task);
	}
	return isSupportedBrowserOrderQueryKey(task.queryKey) && hasNoTargetedIds(task);
}

function isSupportedProductSchedulerTask(task: SchedulerTaskSupportCandidate): boolean {
	if (task.collection !== 'products') return false;
	if (task.queryKey.startsWith(SUPPORTED_TARGETED_PRODUCT_QUERY_KEY_PREFIX)) {
		return hasTargetedIds(task);
	}
	if (isSupportedProductBrowseWindowQueryKey(task.queryKey)) {
		return hasNoTargetedIds(task);
	}
	return SUPPORTED_PRODUCT_SEARCH_QUERY_KEY_PATTERN.test(task.queryKey) && hasNoTargetedIds(task);
}

function isSupportedCustomerSearchTask(task: SchedulerTaskSupportCandidate): boolean {
	const match = SUPPORTED_CUSTOMER_SEARCH_QUERY_KEY_PATTERN.exec(task.queryKey);
	if (!match) return false;
	const queryLimit = Number(match[2]);
	return task.limit === queryLimit && hasNoTargetedIds(task);
}

function isSupportedVariationSchedulerTask(task: SchedulerTaskSupportCandidate): boolean {
	return (
		task.collection === 'variations' &&
		SUPPORTED_VARIATION_SEARCH_QUERY_KEY_PATTERN.test(task.queryKey) &&
		hasNoTargetedIds(task)
	);
}

function isSupportedCustomerSchedulerTask(task: SchedulerTaskSupportCandidate): boolean {
	if (task.collection !== 'customers') return false;
	if (task.queryKey.startsWith(SUPPORTED_TARGETED_CUSTOMER_QUERY_KEY_PREFIX)) {
		return hasTargetedIds(task);
	}
	// The browse window (#951). Its limit is the WINDOW size and must match the key, the same
	// contract the search lane holds — a task whose limit disagrees with its key would fetch a
	// different number of rows than the coverage lane it writes claims to hold.
	const browseWindow = CUSTOMER_BROWSE_WINDOW_GRAMMAR.parse(task.queryKey);
	if (browseWindow !== null) {
		return task.limit === browseWindow.limit && task.mode === 'windowed' && hasNoTargetedIds(task);
	}
	return isSupportedCustomerSearchTask(task);
}

function isSupportedTaxRateSchedulerTask(task: SchedulerTaskSupportCandidate): boolean {
	return (
		task.collection === 'taxRates' &&
		task.queryKey === SUPPORTED_TAX_RATE_QUERY_KEY &&
		task.mode === 'greedy' &&
		hasNoTargetedIds(task)
	);
}

function isSupportedReferenceSchedulerTask(
	task: SchedulerTaskSupportCandidate,
	collection: string,
	queryKey: string
): boolean {
	return (
		task.collection === collection &&
		task.queryKey === queryKey &&
		task.mode === 'greedy' &&
		hasNoTargetedIds(task)
	);
}

// ---------------------------------------------------------------------------
// The drain composition
// ---------------------------------------------------------------------------

type BulkUpsertCollection<T extends { id: string }> = {
	bulkUpsert(documents: T[]): Promise<unknown>;
	bulkRemove(ids: string[]): Promise<unknown>;
	findByIds(ids: string[]): {
		exec(): Promise<Map<string, { toJSON(): unknown }>>;
	};
};

/** The generic pull-apply adapter every non-order fetcher writes through. */
function collectionSchedulerRepository<T extends { id: string }>(
	collection: BulkUpsertCollection<T>
): {
	upsertMany(documents: T[]): Promise<void>;
	removeMany(documents: T[]): Promise<void>;
} {
	return {
		async upsertMany(documents: T[]): Promise<void> {
			const applicable = await withoutLocallyProtected(collection, documents);
			if (applicable.length > 0)
				assertBulkSuccess(await collection.bulkUpsert(applicable), 'engine-scheduler-drain upsert');
		},
		async removeMany(documents: T[]): Promise<void> {
			const stored = await collection.findByIds(documents.map(({ id }) => id)).exec();
			const removable = documents.filter((document) => {
				const current = stored.get(document.id);
				return current !== undefined && !hasPendingLocalWork(current.toJSON());
			});
			if (removable.length > 0)
				assertBulkSuccess(
					await collection.bulkRemove(removable.map(({ id }) => id)),
					'engine-scheduler-drain remove'
				);
		},
	};
}

/** Structural: the collections the drain touches (superset of the repos it builds). */
export type SchedulerDrainDatabase = OrderRepositoryDatabase &
	SchedulerTaskStateDatabase & {
		products: BulkUpsertCollection<{ id: string }>;
		variations: BulkUpsertCollection<{ id: string }>;
		customers: BulkUpsertCollection<{ id: string }>;
		taxRates: BulkUpsertCollection<{ id: string }>;
		categories: BulkUpsertCollection<{ id: string }> & {
			find(query?: unknown): { exec(): Promise<{ toJSON(): unknown }[]> };
			bulkRemove(ids: string[]): Promise<unknown>;
		};
		brands: BulkUpsertCollection<{ id: string }> & {
			find(query?: unknown): { exec(): Promise<{ toJSON(): unknown }[]> };
			bulkRemove(ids: string[]): Promise<unknown>;
		};
		tags: BulkUpsertCollection<{ id: string }> & {
			find(query?: unknown): { exec(): Promise<{ toJSON(): unknown }[]> };
			bulkRemove(ids: string[]): Promise<unknown>;
		};
		coupons: BulkUpsertCollection<{ id: string }> & {
			find(query?: unknown): { exec(): Promise<{ toJSON(): unknown }[]> };
			bulkRemove(ids: string[]): Promise<unknown>;
		};
		existenceManifest: ManifestCollection;
		existenceManifestCustomers: ManifestCollection;
		recordMutations: unknown;
	};

export type RunEngineSchedulerDrainInput = {
	db: SchedulerDrainDatabase;
	coverage: LocalCoverage;
	baseUrl: string;
	ownerId: string;
	/** The engine's transport port — every fetcher pull goes through it. */
	fetcher?: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
	/** Live record cap applied per data pull request. */
	pullBatchSize?: () => number | undefined;
	diagnostics?: SyncObserver;
	signal?: AbortSignal;
	nowMs?: number;
	/**
	 * LIVE clock for mid-drain reads. `nowMs` alone freezes the drain's clock at its
	 * snapshot, which silently neuters the in-fetch lease heartbeat under an injected
	 * clock — every renewal rewrites the original `claimedUntilMs` (#1175 review P2).
	 * Callers with a `now` port pass BOTH: the snapshot for the tick's fixed decisions,
	 * this for renewals that must track the (injected or real) clock as it advances.
	 */
	now?: () => number;
	censusFreshForMs?: number;
	/** Restrict an explicitly requested foreground drain to one seeded task. */
	taskId?: string;
	/** Override for an explicitly requested foreground drain. Background drains
	 * keep the bounded default when this is omitted. */
	maxRequestsPerTask?: number;
	/**
	 * The ONE browse-window lane key this drain is force-refreshing (#948/#957). That window
	 * re-walks from page 1 instead of resuming from its covered prefix — the continuation
	 * that makes ordinary scrolling cheap would otherwise make a refresh a no-op.
	 *
	 * A KEY, not a boolean: a drain executes every runnable persisted task, not only the one
	 * just seeded, so a drain-wide flag would also strip the continuation from unrelated
	 * browse windows already queued in the ledger — up to 50 extra requests each, for a
	 * refresh the cashier asked of one grid.
	 */
	refreshBrowseWindowKey?: string;
	onProgress?: (progress: { collection: string; documents: number; requests: number }) => void;
	withCollectionActivity?: <T>(
		collection: FetchTask['collection'],
		work: () => Promise<T>
	) => Promise<T>;
	/**
	 * LIVE read of the barcode carriers of the SCOPE this drain runs over —
	 * products and variations materialize `payload.barcode` from them (ADR 0006).
	 * A reader, not a value: one drain executes many tasks over many pages, and a
	 * concurrent config poll can move the carrier partway through. Freezing it
	 * would let the tail of a slow drain overwrite freshly re-fetched rows with
	 * the OLD carrier — and the fingerprint has already moved, so nothing would
	 * come back to repair them.
	 */
	barcodeSelectors?: BarcodeSelectorsReader;
};

export type RunEngineSchedulerTaskInput = Pick<
	RunEngineSchedulerDrainInput,
	'db' | 'coverage' | 'baseUrl' | 'fetcher' | 'signal' | 'nowMs' | 'onProgress' | 'barcodeSelectors'
> & {
	task: FetchTask;
};

function createEngineSchedulerFetcherRegistry(
	input: Pick<
		RunEngineSchedulerDrainInput,
		| 'db'
		| 'coverage'
		| 'baseUrl'
		| 'fetcher'
		| 'pullBatchSize'
		| 'diagnostics'
		| 'nowMs'
		| 'now'
		| 'censusFreshForMs'
		| 'refreshBrowseWindowKey'
		| 'barcodeSelectors'
	>,
	/**
	 * How a query-total cache refusal recovers. A DRAIN tick holds claims on
	 * `schedulerTaskStates` rows, and the rebuild drops that store too — so the
	 * refusal must PROPAGATE to `withSchedulerDrainLedgerRecovery`, which aborts
	 * the tick cleanly instead of continuing with claims on dropped rows (#956).
	 * A single in-memory task holds no claims, so retrying against the rebuilt
	 * store is safe and keeps the demand fetch alive.
	 */
	queryTotalRecovery: 'retry-after-rebuild' | 'propagate-refusal'
) {
	const db = input.db;
	const nowMs = input.nowMs ?? Date.now();
	const getNowMs = input.now ?? (input.nowMs === undefined ? Date.now : () => nowMs);
	const orderRepository = new EngineOrderRepository(db);
	const queryTotalRepository =
		queryTotalRecovery === 'retry-after-rebuild'
			? withLedgerRecovery({
					database: db,
					trigger: 'query-total',
					create: () => new RxQueryTotalCacheRepository(db as never),
				})
			: new RxQueryTotalCacheRepository(db as never);
	const cacheQueryTotals: CacheQueryTotals = async ({ queryKeys, totalMatchingRecords }) => {
		const updatedAtMs = getNowMs();
		for (const queryKey of queryKeys) {
			const freshForMs =
				censusCollectionFromQueryKey(queryKey) === null
					? QUERY_TOTAL_FRESH_FOR_MS
					: (input.censusFreshForMs ?? QUERY_TOTAL_FRESH_FOR_MS);
			await queryTotalRepository.upsert({
				queryKey,
				totalMatchingRecords,
				updatedAtMs,
				freshUntilMs: updatedAtMs + freshForMs,
			});
		}
	};
	const coverageRepository = {
		recordQueryResult: (value: Parameters<LocalCoverage['recordQueryResult']>[0]) =>
			input.coverage.recordQueryResult(value),
		recordRecords: (value: Parameters<LocalCoverage['recordRecords']>[0]) =>
			input.coverage.recordRecords(value),
		recordCumulativeQueryResult: (
			value: Parameters<LocalCoverage['recordCumulativeQueryResult']>[0]
		) => input.coverage.recordCumulativeQueryResult(value),
		readLocalLaneCoverage: (collection: string, queryKey: string) =>
			input.coverage.readLane(collection, queryKey),
		// Browse-window lane eviction (#948/#957 follow-up): a completed window deletes the
		// smaller windows of the same view that it contains, so bookkeeping stays ~1x the
		// deepest window instead of quadratic in scroll depth.
		listCoverageLanes: (collection: string) => input.coverage.listLanes(collection),
		removeCoverageLaneIfContained: (value: Parameters<LocalCoverage['removeLaneIfContained']>[0]) =>
			input.coverage.removeLaneIfContained(value),
	};
	const shared = {
		baseUrl: input.baseUrl,
		coverageRepository,
		coverageFreshForMs: ORDER_SCHEDULER_COVERAGE_FRESH_FOR_MS,
		nowMs: getNowMs,
		cacheQueryTotals,
		...(input.diagnostics !== undefined ? { diagnostics: input.diagnostics } : {}),
		...(input.fetcher !== undefined ? { fetcher: input.fetcher } : {}),
		...(input.pullBatchSize !== undefined ? { pullBatchSize: input.pullBatchSize } : {}),
		...(input.refreshBrowseWindowKey !== undefined
			? { refreshBrowseWindowKey: input.refreshBrowseWindowKey }
			: {}),
		...(input.barcodeSelectors !== undefined ? { barcodeSelectors: input.barcodeSelectors } : {}),
	};

	return createSchedulerFetcherRegistry([
		{
			name: 'orders',
			supportsTask: isSupportedOrderSchedulerTask,
			fetcher: createOrdersSchedulerFetcher({
				...shared,
				repository: orderRepository,
				checkpointStore: orderRepository,
				pendingMutationOrderIds: createOrderPendingMutationIds(db.recordMutations as never),
			}),
		},
		{
			name: 'products',
			supportsTask: isSupportedProductSchedulerTask,
			fetcher: createProductsSchedulerFetcher({
				...shared,
				repository: collectionSchedulerRepository(db.products) as never,
				// Leg-3 (ADR 0014): seed the existence-reconcile manifest from the pull's `_rxdb_digest`.
				manifestSink: (rows) => upsertManifestRows(db.existenceManifest, rows),
			}),
		},
		{
			name: 'customers',
			supportsTask: isSupportedCustomerSchedulerTask,
			fetcher: createCustomerSchedulerFetcher({
				...shared,
				// Leg-3 (ADR 0015): the customer manifest is its OWN collection (id-space partition).
				repository: withCustomerManifestPopulation(
					collectionSchedulerRepository(db.customers) as never,
					db.existenceManifestCustomers
				),
			}),
		},
		{
			name: 'variations',
			supportsTask: isSupportedVariationSchedulerTask,
			fetcher: createVariationsSchedulerFetcher({
				...shared,
				repository: collectionSchedulerRepository(db.variations) as never,
				manifestSink: (rows) => upsertManifestRows(db.existenceManifest, rows),
			}),
		},
		{
			name: 'taxRates',
			supportsTask: isSupportedTaxRateSchedulerTask,
			fetcher: createTaxRateSchedulerFetcher({
				...shared,
				repository: collectionSchedulerRepository(db.taxRates) as never,
			}),
		},
		...(
			[
				['categories', CATEGORY_REFERENCE_CONFIG],
				['brands', BRAND_REFERENCE_CONFIG],
				['tags', TAG_REFERENCE_CONFIG],
				['coupons', COUPON_REFERENCE_CONFIG],
			] as const
		).map(([name, config]) => ({
			name,
			supportsTask: (task: SchedulerTaskSupportCandidate) =>
				isSupportedReferenceSchedulerTask(task, config.collection, config.queryKey),
			fetcher: createReferenceCollectionFetcher(config, {
				...shared,
				repository: referenceCollectionRepository(db[name] as never),
			}),
		})),
	]);
}

/** Execute exactly one in-memory task without consulting or mutating durable scheduler state. */
export async function runEngineSchedulerTask(
	input: RunEngineSchedulerTaskInput
): Promise<FetchTaskResult> {
	const registry = createEngineSchedulerFetcherRegistry(input, 'retry-after-rebuild');
	const result = await registry.fetcher(
		input.task,
		input.signal === undefined ? undefined : { signal: input.signal }
	);
	input.onProgress?.({
		collection: input.task.collection,
		documents: result.documentCount,
		requests: result.requestCount,
	});
	return result;
}

/** One drain tick over the ACTIVE scope database — the web tick's exact recipe. */
export async function runEngineSchedulerDrain(
	input: RunEngineSchedulerDrainInput
): Promise<PersistedSchedulerTaskRunnerResult> {
	const db = input.db;
	const nowMs = input.nowMs ?? Date.now();
	const getNowMs = input.now ?? (input.nowMs === undefined ? Date.now : () => nowMs);

	// A `schedulerTaskStates` reconciliation refusal caught mid-tick rebuilds the
	// derivable ledger (#956). The rebuild drops the store this tick claims rows in,
	// so the tick ends as an empty drain — no error to the caller, no re-claim; the
	// next cadence reseeds and re-claims against the rebuilt store. The result is
	// flagged so a demand caller releases rather than reporting a fetch.
	return withSchedulerDrainLedgerRecovery({
		database: db,
		aborted: ledgerRebuiltSchedulerTaskRunnerResult,
		run: () => {
			const schedulerRepository = new RxSchedulerTaskStateRepository(db);
			const fetcherRegistry = createEngineSchedulerFetcherRegistry(input, 'propagate-refusal');
			const supportedRepository = fetcherRegistry.supportedRepository(schedulerRepository);
			const taskId = input.taskId;
			const repository =
				taskId === undefined
					? supportedRepository
					: {
							...supportedRepository,
							readRunnable: async (readAtMs: number) =>
								(await supportedRepository.readRunnable(readAtMs)).filter(
									(state) => state.taskId === taskId
								),
						};

			return runPersistedSchedulerTasks({
				repository,
				fetcher: fetcherRegistry.fetcher,
				...(input.withCollectionActivity !== undefined
					? {
							withTaskActivity: <T>(task: FetchTask, work: () => Promise<T>) =>
								input.withCollectionActivity!(task.collection, work),
						}
					: {}),
				ownerId: input.ownerId,
				nowMs,
				getNowMs,
				leaseForMs: ORDER_SCHEDULER_LEASE_FOR_MS,
				retryAfterMs: ORDER_SCHEDULER_RETRY_AFTER_MS,
				maxRequestsPerTask: input.maxRequestsPerTask ?? ORDER_SCHEDULER_MAX_REQUESTS,
				...(input.onProgress !== undefined ? { onProgress: input.onProgress } : {}),
				...(input.signal !== undefined ? { signal: input.signal } : {}),
			});
		},
	});
}
