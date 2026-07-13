/**
 * Targeted CUSTOMER scheduler-task seeder — the customers mirror of
 * seedTargetedProductSchedulerTask / seedTargetedOrderSchedulerTask. A thin
 * descriptor over the shared `seedTargetedLane` template (rxTargetedLaneSeeder.ts);
 * only the collection, id label, key/requirement prefixes, doc-id format, and lane
 * defaults differ.
 *
 * The change-signal engine's customer `idsToPull` reach the EXISTING `customers:ids:`
 * scheduler lane through this seeder: it queues one (or, for large sets, several
 * schema-safe) on-demand task(s) keyed `customers:ids:<ids>` with `woo-customer:<id>`
 * document ids, which the scheduler tick already routes to the customer fetcher
 * (`createCustomerSchedulerFetcher` → targeted `include=<ids>` fetch). No tick change
 * is needed — the lane already exists (syncCollectionRegistry); this seeder is the
 * change-signal entry point, exactly like products.
 */

import { customerDocumentId } from '@wcpos/sync-core';

import { seedTargetedLane, type TargetedLaneDescriptor } from './rx-targeted-lane-seeder';

import type { SeedPersistedSchedulerTasksResult } from './rx-scheduler-task-seeder';
import type { SchedulerScopeResolver } from './scheduler-scope-resolver';

const CUSTOMER_TARGETED_LANE: TargetedLaneDescriptor = {
	collection: 'customers',
	idLabel: 'customer',
	keyPrefix: 'customers',
	requirementPrefix: 'customers',
	documentId: (id) => customerDocumentId(id),
	defaultPriority: 900,
	defaultBatchSize: 100,
	defaultCompletedDedupeForMs: 30_000,
};

export type SeedTargetedCustomerSchedulerTaskInput = {
	customerIds: number[];
	priority?: number;
	batchSize?: number;
	completedDedupeForMs?: number;
	nowMs?: number;
	getRepository: SchedulerScopeResolver;
};

export async function seedTargetedCustomerSchedulerTask(
	input: SeedTargetedCustomerSchedulerTaskInput
): Promise<SeedPersistedSchedulerTasksResult> {
	return seedTargetedLane(CUSTOMER_TARGETED_LANE, {
		ids: input.customerIds,
		priority: input.priority,
		batchSize: input.batchSize,
		completedDedupeForMs: input.completedDedupeForMs,
		nowMs: input.nowMs,
		getRepository: input.getRepository,
		// This seeder IS the change-signal targeted customer entry point, so an in-flight pull
		// re-seeded by a newer mutation must re-run rather than drop the change (#318).
		coalesceInFlight: true,
	});
}
