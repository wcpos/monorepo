import { describe, expect, it, vi } from 'vitest';

import { StoreScopeManager, type SyncEvent } from '@wcpos/sync-core';

import { createMaintenanceLanes } from './maintenance-lanes';
import { censusTotalsFromCache } from '../scheduler';

import type { LocalCoverage } from '../local-coverage/local-coverage';

/**
 * A skipped maintenance tick used to be completely silent, so a lane that never
 * ran in a real browser left no evidence at all (#1318 cost four live soaks to
 * narrow). These pin the reason onto the wire the app can actually read: a
 * `maintenance.lane.tick` diagnostic at debug level, carrying the lane and the
 * reason in `fields`.
 */
async function skipHarness(overrides?: {
	connectivity?: () => 'online' | 'offline' | 'degraded';
	hasPendingInteractiveWork?: () => boolean;
	coverage?: LocalCoverage | null;
}) {
	const database = {
		listCollections: () => [],
		resetCollection: async () => undefined,
		pendingMutationCount: async () => 0,
		close: async () => undefined,
	};
	const manager = new StoreScopeManager({ createDatabase: async () => database });
	await manager.switchTo('scope');
	const diagnostics: SyncEvent[] = [];
	const lanes = createMaintenanceLanes({
		manager,
		databaseFor: () => database as never,
		coverageFor: () => overrides?.coverage ?? null,
		syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
		fetcher: async () => Response.json({}),
		connectivity: overrides?.connectivity ?? (() => 'online'),
		diagnostics: (event) => diagnostics.push(event),
		ownerId: () => 'owner',
		censusFreshForMs: 60_000,
		customerTrickleStateFor: () => ({ get: async () => null, set: async () => undefined }),
		censusTotals: async () => censusTotalsFromCache([], 1_000),
		customerCensusTotal: async () => null,
		productTrickleStateFor: () => ({ get: async () => null, set: async () => undefined }),
		productCensusTotal: async () => null,
		variationPrefetchStateFor: () => ({ get: async () => null, set: async () => undefined }),
		variationCensusTotal: async () => null,
		hasPendingInteractiveWork: overrides?.hasPendingInteractiveWork ?? (() => false),
		isWritePlaneOwner: () => true,
		emitEvent: () => undefined,
		now: () => 1_000,
	});
	return { lanes, diagnostics };
}

const skipEvents = (diagnostics: SyncEvent[]) =>
	diagnostics.filter(
		(event) =>
			event.type === 'maintenance.lane.tick' &&
			(event.fields as { status?: unknown } | undefined)?.status === 'skipped'
	);

describe('maintenance lane skip diagnostics (#1318)', () => {
	it('emits the body-level skip reason for a lane that silently declined to run', async () => {
		const context = await skipHarness({ hasPendingInteractiveWork: () => true });

		await expect(context.lanes.productTrickle.tick()).resolves.toMatchObject({
			lane: 'product-trickle',
			status: 'skipped',
			reason: 'interactive-demand',
		});
		expect(skipEvents(context.diagnostics)).toContainEqual(
			expect.objectContaining({
				type: 'maintenance.lane.tick',
				// Debug, not info: a routine "nothing to do" is forensic evidence, not
				// a row a cashier should read.
				level: 'debug',
				fields: expect.objectContaining({
					lane: 'product-trickle',
					status: 'skipped',
					reason: 'interactive-demand',
				}),
			})
		);
	});

	it('emits the guard-level skip reason before the lane body is even reached', async () => {
		const context = await skipHarness({ connectivity: () => 'offline' });

		await expect(context.lanes.productTrickle.tick()).resolves.toMatchObject({
			status: 'skipped',
			reason: 'offline',
		});
		expect(skipEvents(context.diagnostics)).toContainEqual(
			expect.objectContaining({
				level: 'debug',
				fields: expect.objectContaining({ lane: 'product-trickle', reason: 'offline' }),
			})
		);
	});

	it('does not write a second event when the tick already summarised its stand-down', async () => {
		// A deferred existence-reconcile reports partial work AND a stand-down: the
		// summary row must name the reason, and the skip must not duplicate it.
		const coverage = {
			primeManifest: vi.fn(async () => ({ products: 0, customers: 0, orders: 0 })),
			reconcilePass: vi.fn(async () => ({
				buckets: 1,
				emptyBuckets: 0,
				pruned: 0,
				missing: 0,
				changed: 0,
				skippedDirty: 0,
				deferred: true,
			})),
		} as unknown as LocalCoverage;
		const context = await skipHarness({ coverage });

		await expect(context.lanes.existenceReconcile.tick()).resolves.toMatchObject({
			status: 'skipped',
			reason: 'server-pressure',
		});
		const events = skipEvents(context.diagnostics);
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			level: 'info',
			message: expect.stringContaining('Existence audit'),
			fields: expect.objectContaining({
				lane: 'existence-reconcile',
				status: 'skipped',
				reason: 'server-pressure',
				outcome: 'cancelled',
			}),
		});
	});

	it('stays silent when the lane actually runs', async () => {
		const context = await skipHarness();

		await expect(context.lanes.coverageCompaction.tick()).resolves.toMatchObject({
			status: 'ran',
		});
		expect(skipEvents(context.diagnostics)).toEqual([]);
	});
});
