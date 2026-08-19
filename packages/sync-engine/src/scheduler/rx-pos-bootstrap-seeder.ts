/**
 * POS bootstrap seeder — enqueues the GREEDY Tier-0 lanes a POS needs before it
 * can sell, on app start. This is the orchestration the C3 gap left missing: the
 * scheduler infra (policies, fetchers, durable queue, priority-ordered drain)
 * already exists, but nothing seeded the required startup lanes at boot.
 *
 * What it seeds (and, deliberately, what it does NOT):
 *   - tax rates → a GREEDY `taxRates:all` lane at top priority (1000). Small,
 *     required, blocks cart math — the canonical greedy case (pain point #2,
 *     CONTEXT.md "Greedy lane" / "Required startup subset"). Drains to completion.
 *   - Categories, brands, tags, and coupons are fetched on demand, not seeded at boot.
 *   - It does NOT seed orders or the full product catalog. Those are huge and
 *     historical: orders stay on-demand (recent window + targeted/search), the
 *     catalog is a working set grown by coverage. Bulk-pulling them at boot is
 *     the anti-pattern this experiment exists to avoid (guardrail G3,
 *     docs/pos-replication-model.md).
 *
 * Mirrors the existing seedOrderSchedulerTasks shape (singleton-backed; no DB
 * handle passed). Priority is honoured at DRAIN time by the C3 fix in
 * rxSchedulerTaskRunner.ts.
 */

import { REFERENCE_COLLECTIONS, type ReferenceCollection } from '@wcpos/sync-core';

import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';
import {
	DEFAULT_REFERENCE_LANE_DESCRIPTOR,
	parseReferenceLaneQueryKey,
	type ReferenceLaneDescriptor,
	referenceLaneQueryKey,
} from './reference-lane-descriptor';
import {
	seedPersistedSchedulerTasks,
	type SeedPersistedSchedulerTasksResult,
} from './rx-scheduler-task-seeder';
import {
	RxSchedulerTaskStateRepository,
	type SchedulerTaskStateDatabase,
} from './rx-scheduler-task-state-repository';
import { withSchedulerSeedLedgerRecovery } from '../local-coverage/ledger-storage-recovery';
import {
	BRAND_REFERENCE_CONFIG,
	CATEGORY_REFERENCE_CONFIG,
	COUPON_REFERENCE_CONFIG,
	type ReferenceCollectionConfig,
	TAG_REFERENCE_CONFIG,
} from './rx-scheduler-reference-fetcher';

import type { SyncCollectionName } from '../collections/engine-collections';
import type { FetchTask } from './replication-policy';

/** Canonical Tier-0 priority for the required greedy startup subset (tax rates). */
const TAX_RATES_PRIORITY = 1000;
const TAX_RATES_QUERY_KEY = 'taxRates:all';
// Categories + brands + tags + coupons: small, sell-relevant pull-only data — greedy,
// just below tax rates (pain point #2 groups categories with tax as critical-startup).
// Ordered categories > brands > tags > coupons (coupons apply at checkout, after the
// catalog reference data the browse UI needs first).
const CATEGORY_PRIORITY = 950;
const BRAND_PRIORITY = 940;
const TAG_PRIORITY = 930;
const COUPON_PRIORITY = 920;

/**
 * The greedy startup lanes to enqueue at boot. Pure (no I/O) so the tier policy
 * is unit-testable. Each task MUST satisfy its fetcher's `supportsTask` guard —
 * the tax-rate fetcher requires queryKey 'taxRates:all', mode 'greedy', no ids
 * (isSupportedTaxRateSchedulerTask).
 */
/** The greedy `taxRates:all` lane — Tier 0; the POS cannot sell without tax rates. */
export function taxRatesLaneTask(): FetchTask {
	return {
		id: `${TAX_RATES_QUERY_KEY}:greedy`,
		requirementId: 'taxRates.all',
		collection: 'taxRates',
		queryKey: TAX_RATES_QUERY_KEY,
		limit: WOO_REST_MAX_PER_PAGE,
		priority: TAX_RATES_PRIORITY,
		mode: 'greedy',
	};
}

/**
 * Per-reference-collection lane inputs: its config (queryKey/collection) + greedy
 * priority. These lanes are seeded by on-demand and upkeep refreshes, never boot.
 */
export const REFERENCE_LANE_CONFIGS: Record<
	ReferenceCollection,
	{ config: ReferenceCollectionConfig; priority: number }
> = {
	categories: { config: CATEGORY_REFERENCE_CONFIG, priority: CATEGORY_PRIORITY },
	brands: { config: BRAND_REFERENCE_CONFIG, priority: BRAND_PRIORITY },
	tags: { config: TAG_REFERENCE_CONFIG, priority: TAG_PRIORITY },
	coupons: { config: COUPON_REFERENCE_CONFIG, priority: COUPON_PRIORITY },
};

export function laneKeyFor(collection: SyncCollectionName): string | null {
	if (collection === 'taxRates') return TAX_RATES_QUERY_KEY;
	return REFERENCE_LANE_CONFIGS[collection as ReferenceCollection]?.config.queryKey ?? null;
}

/**
 * The greedy reference lane task for one collection. The greedy fetcher is prunable, so
 * one re-pull upserts current rows AND set-difference-prunes a deleted one — no separate
 * tombstone arm (unlike tax rates, whose lane only upserts). Used both at boot and by the
 * change-signal tick to re-seed ONLY the changed collection (never the other reference lanes).
 */
export function referenceLaneTaskFor<C extends ReferenceCollection>(
	collection: C,
	descriptor: ReferenceLaneDescriptor<C> = DEFAULT_REFERENCE_LANE_DESCRIPTOR
): FetchTask {
	const { config, priority } = REFERENCE_LANE_CONFIGS[collection];
	const queryKey = referenceLaneQueryKey(collection, descriptor);
	return {
		id: `${queryKey}:greedy`,
		requirementId: `${collection}.all`,
		collection: config.collection,
		queryKey,
		limit: WOO_REST_MAX_PER_PAGE,
		priority,
		mode: 'greedy',
	};
}

export function posBootstrapTasks(): FetchTask[] {
	return [taxRatesLaneTask()];
}

export type SeedPosBootstrapLanesInput = {
	/** Change-signal seeds disable completed-dedupe; boot seeding wants a fresh pull. */
	completedDedupeForMs?: number;
	nowMs?: number;
	database: SchedulerTaskStateDatabase;
	/** Opt into in-flight coalescing (#318) — set only by the change-signal refresh lanes. */
	coalesceInFlight?: boolean;
};

/**
 * Enqueues the greedy Tier-0 startup lanes into the durable scheduler queue. The
 * existing scheduler tick drains them — and, with the C3 priority-drain fix,
 * drains them ahead of any lower-priority backlog work.
 */
async function seedTasks(
	tasks: FetchTask[],
	input: SeedPosBootstrapLanesInput
): Promise<SeedPersistedSchedulerTasksResult> {
	// A `schedulerTaskStates` reconciliation refusal rebuilds the derivable ledger
	// and the seed runs again against the fresh store (#956) — callers treat a
	// resolved seed as a durable enqueue, so it must not resolve empty.
	return withSchedulerSeedLedgerRecovery({
		database: input.database,
		run: () =>
			seedPersistedSchedulerTasks({
				repository: new RxSchedulerTaskStateRepository(input.database),
				tasks,
				nowMs: input.nowMs ?? Date.now(),
				completedDedupeForMs: input.completedDedupeForMs ?? 0,
				coalesceInFlight: input.coalesceInFlight ?? false,
			}),
	});
}

export async function seedPosBootstrapLanes(
	input: SeedPosBootstrapLanesInput
): Promise<SeedPersistedSchedulerTasksResult> {
	return seedTasks(posBootstrapTasks(), input);
}

/**
 * Re-seed ONLY the greedy tax-rate lane. The change-signal tick's refreshTaxRates
 * handler uses this so a tax-rate change doesn't needlessly re-seed categories +
 * brands too (CodeRabbit review).
 */
export async function seedTaxRatesLane(
	input: SeedPosBootstrapLanesInput
): Promise<SeedPersistedSchedulerTasksResult> {
	// Change-signal refresh → opt into in-flight coalescing (#318).
	return seedTasks([taxRatesLaneTask()], { ...input, coalesceInFlight: true });
}

/**
 * Re-seed ONLY the greedy reference lanes for categories, brands, tags, and coupons (F11 —
 * in-session reference refresh). Keeps them fresh mid-session without re-seeding tax rates
 * (which have their own change-signal refresh). Called on a periodic interval so a reference
 * edit or deletion reaches a running POS without an app reload; re-pulling the tiny reference
 * set is cheap.
 */
export async function seedReferenceLanes(
	input: SeedPosBootstrapLanesInput & {
		collections?: readonly ReferenceCollection[];
		sorts?: Partial<Record<ReferenceCollection, ReferenceLaneDescriptor>>;
	}
): Promise<SeedPersistedSchedulerTasksResult> {
	const collections = input.collections ?? REFERENCE_COLLECTIONS;
	return withSchedulerSeedLedgerRecovery({
		database: input.database,
		run: async () => {
			const repository = new RxSchedulerTaskStateRepository(input.database);
			const existing = await repository.readForCollections([...collections]);
			const tasks = collections.map((collection) => {
				const persisted = existing
					.map((state) => ({ state, parsed: parseReferenceLaneQueryKey(state.queryKey) }))
					.find(({ parsed }) => parsed?.collection === collection);
				const descriptor = input.sorts?.[collection] ?? persisted?.parsed?.descriptor;
				return referenceLaneTaskFor(collection, descriptor ?? DEFAULT_REFERENCE_LANE_DESCRIPTOR);
			});
			for (const state of existing) {
				const replacement = tasks.find(
					(task) => parseReferenceLaneQueryKey(state.queryKey)?.collection === task.collection
				);
				if (replacement && replacement.id !== state.taskId && !(await repository.remove(state))) {
					throw new Error(`reference lane supersede lost for ${state.taskId}`);
				}
			}
			return seedPersistedSchedulerTasks({
				repository,
				tasks,
				nowMs: input.nowMs ?? Date.now(),
				completedDedupeForMs: input.completedDedupeForMs ?? 0,
				coalesceInFlight: input.coalesceInFlight ?? false,
			});
		},
	});
}
