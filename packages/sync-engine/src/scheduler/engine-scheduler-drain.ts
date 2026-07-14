import { assertBulkSuccess } from '@wcpos/sync-core';
/**
 * The engine's persisted scheduler DRAIN composition (slice 5e, #430
 * phase 1): the web host's rxOrderSchedulerTick + syncCollectionRegistry
 * scheduler entries, engine-side. ONE context, N collections — each
 * per-collection fetcher builds from the same inputs, and WHICH collections
 * participate is this table's decision. The task-support predicates moved
 * here verbatim; the web registry imports them until phase 2 deletes it.
 */

import {
	type PersistedSchedulerTaskRunnerResult,
	runPersistedSchedulerTasks,
} from './rx-scheduler-task-runner';
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
import { createCustomerSchedulerFetcher } from './rx-scheduler-customer-fetcher';
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
import { withoutLocallyProtected } from '../write-path/local-work-guard';
import { withCustomerManifestPopulation } from '../local-coverage/existence-manifest-population';
import {
	type ManifestCollection,
	upsertManifestRows,
} from '../local-coverage/rx-existence-manifest-repository';
import {
	EngineOrderRepository,
	type OrderRepositoryDatabase,
} from '../write-path/engine-order-repository';
import { parseOrderBrowserSchedulerDescriptor } from './order-browser-scheduler-descriptor';

import type { LocalCoverage } from '../local-coverage/local-coverage';

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
	const decision = parseOrderBrowserSchedulerDescriptor(queryKey);
	return !!decision && 'descriptor' in decision;
}

export function isSupportedOrderSchedulerTask(task: SchedulerTaskSupportCandidate): boolean {
	if (task.collection !== 'orders') return false;
	if (task.queryKey === SUPPORTED_ORDER_QUERY_KEY && hasNoTargetedIds(task)) return true;
	if (task.queryKey.startsWith(SUPPORTED_TARGETED_ORDER_QUERY_KEY_PREFIX)) {
		return hasTargetedIds(task);
	}
	return isSupportedBrowserOrderQueryKey(task.queryKey) && hasNoTargetedIds(task);
}

export function isSupportedProductSchedulerTask(task: SchedulerTaskSupportCandidate): boolean {
	if (task.collection !== 'products') return false;
	if (task.queryKey.startsWith(SUPPORTED_TARGETED_PRODUCT_QUERY_KEY_PREFIX)) {
		return hasTargetedIds(task);
	}
	return SUPPORTED_PRODUCT_SEARCH_QUERY_KEY_PATTERN.test(task.queryKey) && hasNoTargetedIds(task);
}

function isSupportedCustomerSearchTask(task: SchedulerTaskSupportCandidate): boolean {
	const match = SUPPORTED_CUSTOMER_SEARCH_QUERY_KEY_PATTERN.exec(task.queryKey);
	if (!match) return false;
	const queryLimit = Number(match[2]);
	return task.limit === queryLimit && hasNoTargetedIds(task);
}

export function isSupportedCustomerSchedulerTask(task: SchedulerTaskSupportCandidate): boolean {
	if (task.collection !== 'customers') return false;
	if (task.queryKey.startsWith(SUPPORTED_TARGETED_CUSTOMER_QUERY_KEY_PREFIX)) {
		return hasTargetedIds(task);
	}
	return isSupportedCustomerSearchTask(task);
}

export function isSupportedTaxRateSchedulerTask(task: SchedulerTaskSupportCandidate): boolean {
	return (
		task.collection === 'taxRates' &&
		task.queryKey === SUPPORTED_TAX_RATE_QUERY_KEY &&
		task.mode === 'greedy' &&
		hasNoTargetedIds(task)
	);
}

export function isSupportedReferenceSchedulerTask(
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
	findByIds(ids: string[]): {
		exec(): Promise<Map<string, { toJSON(): unknown }>>;
	};
};

/** The generic pull-apply adapter every non-order fetcher writes through. */
export function collectionSchedulerRepository<T extends { id: string }>(
	collection: BulkUpsertCollection<T>
): {
	upsertMany(documents: T[]): Promise<void>;
} {
	return {
		async upsertMany(documents: T[]): Promise<void> {
			const applicable = await withoutLocallyProtected(collection, documents);
			if (applicable.length > 0)
				assertBulkSuccess(await collection.bulkUpsert(applicable), 'engine-scheduler-drain upsert');
		},
	};
}

/** Structural: the collections the drain touches (superset of the repos it builds). */
export type SchedulerDrainDatabase = OrderRepositoryDatabase &
	SchedulerTaskStateDatabase & {
		products: BulkUpsertCollection<{ id: string }>;
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
	signal?: AbortSignal;
	nowMs?: number;
	/** Override for an explicitly requested foreground drain. Background drains
	 * keep the bounded default when this is omitted. */
	maxRequestsPerTask?: number;
	onProgress?: (progress: { collection: string; documents: number; requests: number }) => void;
};

/** One drain tick over the ACTIVE scope database — the web tick's exact recipe. */
export async function runEngineSchedulerDrain(
	input: RunEngineSchedulerDrainInput
): Promise<PersistedSchedulerTaskRunnerResult> {
	const db = input.db;
	const nowMs = input.nowMs ?? Date.now();
	const getNowMs = input.nowMs === undefined ? Date.now : () => nowMs;
	const schedulerRepository = new RxSchedulerTaskStateRepository(db);
	const orderRepository = new EngineOrderRepository(db);
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
	};
	const shared = {
		baseUrl: input.baseUrl,
		coverageRepository,
		coverageFreshForMs: ORDER_SCHEDULER_COVERAGE_FRESH_FOR_MS,
		nowMs: getNowMs,
		...(input.fetcher !== undefined ? { fetcher: input.fetcher } : {}),
	};

	const fetcherRegistry = createSchedulerFetcherRegistry([
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

	return runPersistedSchedulerTasks({
		repository: fetcherRegistry.supportedRepository(schedulerRepository),
		fetcher: fetcherRegistry.fetcher,
		ownerId: input.ownerId,
		nowMs,
		getNowMs,
		leaseForMs: ORDER_SCHEDULER_LEASE_FOR_MS,
		retryAfterMs: ORDER_SCHEDULER_RETRY_AFTER_MS,
		maxRequestsPerTask: input.maxRequestsPerTask ?? ORDER_SCHEDULER_MAX_REQUESTS,
		...(input.onProgress !== undefined ? { onProgress: input.onProgress } : {}),
		...(input.signal !== undefined ? { signal: input.signal } : {}),
	});
}
