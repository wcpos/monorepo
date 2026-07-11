/**
 * Targeted PRODUCT scheduler-task seeder — the products mirror of
 * seedTargetedOrderSchedulerTask (rxOrderSchedulerTaskSeeder.ts). Both are now thin
 * descriptors over the shared `seedTargetedLane` template (rxTargetedLaneSeeder.ts);
 * only the collection, id label, key/requirement prefixes, doc-id format, and lane
 * defaults differ.
 *
 * The change-signal engine's product `idsToPull` reach the EXISTING `products:ids:`
 * scheduler lane through this seeder: it queues one (or, for large sets, several
 * schema-safe) on-demand task(s) keyed `products:ids:<ids>` with
 * `woo-product:<id>` document ids, which `rxOrderSchedulerTick` already routes to
 * `createProductsSchedulerFetcher` → `fetchTargetedProducts`
 * (wc/v3/products?include=<ids>&orderby=include). No engine change is needed in
 * the tick — the lane already exists; this seeder is the entry point.
 */

import { seedTargetedLane, type TargetedLaneDescriptor } from './rx-targeted-lane-seeder';

import type { SeedPersistedSchedulerTasksResult } from './rx-scheduler-task-seeder';
import type { SchedulerScopeResolver } from './scheduler-scope-resolver';

const PRODUCT_TARGETED_LANE: TargetedLaneDescriptor = {
	collection: 'products',
	idLabel: 'product',
	keyPrefix: 'products',
	requirementPrefix: 'products',
	documentId: (id) => `woo-product:${id}`,
	defaultPriority: 900,
	defaultBatchSize: 100,
	defaultCompletedDedupeForMs: 30_000,
};

export type SeedTargetedProductSchedulerTaskInput = {
	productIds: number[];
	priority?: number;
	batchSize?: number;
	completedDedupeForMs?: number;
	nowMs?: number;
	getRepository: SchedulerScopeResolver;
};

export async function seedTargetedProductSchedulerTask(
	input: SeedTargetedProductSchedulerTaskInput
): Promise<SeedPersistedSchedulerTasksResult> {
	return seedTargetedLane(PRODUCT_TARGETED_LANE, {
		ids: input.productIds,
		priority: input.priority,
		batchSize: input.batchSize,
		completedDedupeForMs: input.completedDedupeForMs,
		nowMs: input.nowMs,
		getRepository: input.getRepository,
		// This seeder IS the change-signal targeted product entry point, so an in-flight pull
		// re-seeded by a newer mutation must re-run rather than drop the change (#318).
		coalesceInFlight: true,
	});
}
