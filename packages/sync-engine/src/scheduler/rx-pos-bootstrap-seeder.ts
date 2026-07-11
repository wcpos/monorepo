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
 *   - categories, brands, tags, and coupons → one GREEDY reference lane per
 *     collection, ordered just below tax rates.
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

import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';
import type { SchedulerScopeResolver } from './scheduler-scope-resolver';
import { seedPersistedSchedulerTasks, type SeedPersistedSchedulerTasksResult } from './rx-scheduler-task-seeder';
import { RxSchedulerTaskStateRepository } from './rx-scheduler-task-state-repository';
import { BRAND_REFERENCE_CONFIG, CATEGORY_REFERENCE_CONFIG, COUPON_REFERENCE_CONFIG, TAG_REFERENCE_CONFIG, type ReferenceCollectionConfig } from './rx-scheduler-reference-fetcher';
import { REFERENCE_COLLECTIONS, type ReferenceCollection } from '@woo-rxdb-lab/sync-core';
import type { FetchTask } from './replication-policy';

/** Canonical Tier-0 priority for the required greedy startup subset (tax rates). */
const TAX_RATES_PRIORITY = 1000;
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
    id: 'taxRates:all:greedy',
    requirementId: 'taxRates.all',
    collection: 'taxRates',
    queryKey: 'taxRates:all',
    limit: WOO_REST_MAX_PER_PAGE,
    priority: TAX_RATES_PRIORITY,
    mode: 'greedy',
  };
}

/**
 * Per-reference-collection lane inputs: its config (queryKey/collection) + greedy
 * priority. One map drives BOTH boot seeding and the change-signal per-collection
 * re-seed, so a new reference collection is a map entry, not another copy.
 */
const REFERENCE_LANE_CONFIGS: Record<ReferenceCollection, { config: ReferenceCollectionConfig; priority: number }> = {
  categories: { config: CATEGORY_REFERENCE_CONFIG, priority: CATEGORY_PRIORITY },
  brands: { config: BRAND_REFERENCE_CONFIG, priority: BRAND_PRIORITY },
  tags: { config: TAG_REFERENCE_CONFIG, priority: TAG_PRIORITY },
  coupons: { config: COUPON_REFERENCE_CONFIG, priority: COUPON_PRIORITY },
};

/**
 * The greedy reference lane task for one collection. The greedy fetcher is prunable, so
 * one re-pull upserts current rows AND set-difference-prunes a deleted one — no separate
 * tombstone arm (unlike tax rates, whose lane only upserts). Used both at boot and by the
 * change-signal tick to re-seed ONLY the changed collection (never the other reference lanes).
 */
export function referenceLaneTaskFor(collection: ReferenceCollection): FetchTask {
  const { config, priority } = REFERENCE_LANE_CONFIGS[collection];
  return {
    id: `${config.queryKey}:greedy`,
    requirementId: `${collection}.all`,
    collection: config.collection,
    queryKey: config.queryKey,
    limit: WOO_REST_MAX_PER_PAGE,
    priority,
    mode: 'greedy',
  };
}

/**
 * The greedy categories + brands + tags + coupons reference lanes, in stable order.
 * Extracted so they can be re-seeded on their own (F11): a completed greedy task is
 * terminal, so a rename/edit made mid-session never reaches a running POS without a
 * re-seed → re-pull → set-difference prune.
 */
export function referenceLaneTasks(): FetchTask[] {
  return REFERENCE_COLLECTIONS.map(referenceLaneTaskFor);
}

export function posBootstrapTasks(): FetchTask[] {
  return [taxRatesLaneTask(), ...referenceLaneTasks()];
}

export type SeedPosBootstrapLanesInput = {
  /** Change-signal seeds disable completed-dedupe; boot seeding wants a fresh pull. */
  completedDedupeForMs?: number;
  nowMs?: number;
  getRepository: SchedulerScopeResolver;
  /** Opt into in-flight coalescing (#318) — set only by the change-signal refresh lanes. */
  coalesceInFlight?: boolean;
};

/**
 * Enqueues the greedy Tier-0 startup lanes into the durable scheduler queue. The
 * existing scheduler tick drains them — and, with the C3 priority-drain fix,
 * drains them ahead of any lower-priority backlog work.
 */
async function seedTasks(tasks: FetchTask[], input: SeedPosBootstrapLanesInput): Promise<SeedPersistedSchedulerTasksResult> {
  const repository = await input.getRepository();
  const schedulerRepository = new RxSchedulerTaskStateRepository(repository.getDatabase());
  return seedPersistedSchedulerTasks({
    repository: schedulerRepository,
    tasks,
    nowMs: input.nowMs ?? Date.now(),
    completedDedupeForMs: input.completedDedupeForMs ?? 0,
    coalesceInFlight: input.coalesceInFlight ?? false,
  });
}

export async function seedPosBootstrapLanes(
  input: SeedPosBootstrapLanesInput,
): Promise<SeedPersistedSchedulerTasksResult> {
  return seedTasks(posBootstrapTasks(), input);
}

/**
 * Re-seed ONLY the greedy tax-rate lane. The change-signal tick's refreshTaxRates
 * handler uses this so a tax-rate change doesn't needlessly re-seed categories +
 * brands too (CodeRabbit review).
 */
export async function seedTaxRatesLane(
  input: SeedPosBootstrapLanesInput,
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
  input: SeedPosBootstrapLanesInput,
): Promise<SeedPersistedSchedulerTasksResult> {
  return seedTasks(referenceLaneTasks(), input);
}

/**
 * Re-seed ONLY the greedy lane for one reference collection (coupons/categories/brands/
 * tags). The change-signal tick's `refreshReferenceCollection` handler uses this so a
 * change to one collection re-pulls just that collection (never the others). The one
 * greedy pull upserts current rows and set-difference-prunes a deleted one, so a
 * create/update/delete all reconcile through this single refresh.
 */
export async function seedReferenceCollectionLane(
  collection: ReferenceCollection,
  input: SeedPosBootstrapLanesInput,
): Promise<SeedPersistedSchedulerTasksResult> {
  // Change-signal refresh → opt into in-flight coalescing (#318).
  return seedTasks([referenceLaneTaskFor(collection)], { ...input, coalesceInFlight: true });
}
