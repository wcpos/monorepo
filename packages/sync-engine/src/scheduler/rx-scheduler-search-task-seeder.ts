/**
 * SEARCH scheduler-task seeder — the products/customers mirror of
 * seedOrderFilterSchedulerTask (rxOrderSchedulerTaskSeeder.ts). Like that seeder
 * it is a SINGLE windowed task (no id chunking), and it OWNS the per-collection
 * search-lane queryKey grammar so the public search-demand verb never has to:
 *
 *   - products  → `products:search:<encodeURIComponent(term)>`
 *   - customers → `customers:search=<encodeURIComponent(term)>:limit=<limit>`
 *
 * Those keys are exactly what `isSupportedProductSchedulerTask` /
 * `isSupportedCustomerSchedulerTask` (engine-scheduler-drain.ts) already accept and
 * what `createProductsSchedulerFetcher` / `createCustomerSchedulerFetcher` already
 * decode — no engine change is needed in the drain; this seeder is the entry point.
 *
 * The customer support predicate additionally requires `task.limit` to equal the
 * `limit=` encoded in the key, so the seeded FetchTask.limit and the key limit are
 * always minted together from the same value. An empty term is rejected loudly here
 * (the products grammar's `.+` already rejects it); the caller must not seed one.
 */

import {
	seedPersistedSchedulerTasks,
	type SeedPersistedSchedulerTasksResult,
} from './rx-scheduler-task-seeder';
import { RxSchedulerTaskStateRepository } from './rx-scheduler-task-state-repository';
import { schedulerTaskStateSchema } from './scheduler-task-state-schema';

import type { ReplicationMode } from './replication-policy';
import type { SchedulerScopeResolver } from './scheduler-scope-resolver';

const SCHEDULER_TASK_KEY_MAX_LENGTH = schedulerTaskStateSchema.properties.queryKey.maxLength;
const SCHEDULER_REQUIREMENT_ID_MAX_LENGTH =
	schedulerTaskStateSchema.properties.requirementId.maxLength;

/** The one shape every search lane runs as — a windowed task the drain paginates once. */
const SEARCH_MODE: ReplicationMode = 'windowed';
const DEFAULT_SEARCH_LIMIT = 25;
/** Foreground-demand band — the require-plane default requirement priority. */
const DEFAULT_SEARCH_PRIORITY = 500;

export type SearchSchedulerCollection = 'products' | 'customers';

/** The per-collection values that distinguish one search lane from another. */
type SearchLaneDescriptor = {
	collection: SearchSchedulerCollection;
	/** term → the drain-supported search-lane queryKey (limit only used by customers). */
	buildQueryKey: (encodedTerm: string, limit: number) => string;
	/** A stable diagnostics label for the requirement (raw term; limit only used by customers). */
	buildRequirementId: (term: string, limit: number) => string;
};

const SEARCH_LANES: Record<SearchSchedulerCollection, SearchLaneDescriptor> = {
	products: {
		collection: 'products',
		buildQueryKey: (encodedTerm) => `products:search:${encodedTerm}`,
		buildRequirementId: (term) => `products.search.${term}`,
	},
	customers: {
		collection: 'customers',
		buildQueryKey: (encodedTerm, limit) => `customers:search=${encodedTerm}:limit=${limit}`,
		buildRequirementId: (term, limit) => `customers.search.${term}.limit.${limit}`,
	},
};

export type SeedSearchSchedulerTaskInput = {
	collection: SearchSchedulerCollection;
	term: string;
	priority?: number;
	limit?: number;
	completedDedupeForMs?: number;
	nowMs?: number;
	getRepository: SchedulerScopeResolver;
};

function searchLimit(limit?: number): number {
	const normalized = limit ?? DEFAULT_SEARCH_LIMIT;
	if (!Number.isSafeInteger(normalized) || normalized <= 0) {
		throw new Error('Search scheduler task limit must be a positive integer');
	}
	return normalized;
}

export async function seedSearchSchedulerTask(
	input: SeedSearchSchedulerTaskInput
): Promise<SeedPersistedSchedulerTasksResult> {
	const descriptor = SEARCH_LANES[input.collection];
	if (!descriptor) {
		throw new Error(
			`Search scheduler task requires a supported collection (products/customers): ${input.collection}`
		);
	}
	const term = input.term.trim();
	if (term.length === 0) {
		throw new Error('Search scheduler task requires a non-empty term');
	}
	const limit = searchLimit(input.limit);
	const queryKey = descriptor.buildQueryKey(encodeURIComponent(term), limit);
	const requirementId = descriptor.buildRequirementId(term, limit);
	if (queryKey.length > SCHEDULER_TASK_KEY_MAX_LENGTH) {
		throw new Error(
			`Search scheduler queryKey exceeds schema limit: ${queryKey.length} > ${SCHEDULER_TASK_KEY_MAX_LENGTH}`
		);
	}
	if (requirementId.length > SCHEDULER_REQUIREMENT_ID_MAX_LENGTH) {
		throw new Error(
			`Search scheduler requirementId exceeds schema limit: ${requirementId.length} > ${SCHEDULER_REQUIREMENT_ID_MAX_LENGTH}`
		);
	}

	const repository = await input.getRepository();
	const schedulerRepository = new RxSchedulerTaskStateRepository(repository.getDatabase());
	const nowMs = input.nowMs ?? Date.now();

	return seedPersistedSchedulerTasks({
		repository: schedulerRepository,
		tasks: [
			{
				id: `${queryKey}:${SEARCH_MODE}`,
				requirementId,
				collection: descriptor.collection,
				queryKey,
				limit,
				priority: input.priority ?? DEFAULT_SEARCH_PRIORITY,
				mode: SEARCH_MODE,
			},
		],
		nowMs,
		// UI-declared, re-declared per render (ADR 0027 / #473): a MEMORY-path requirement,
		// not durable. Completed-dedupe absorbs the per-render re-declaration spam; a
		// forceRefresh caller passes 0 to disable it (mirrors the orders query path).
		completedDedupeForMs: input.completedDedupeForMs ?? 30_000,
	});
}
