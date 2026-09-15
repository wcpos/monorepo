import { describe, expect, it, vi } from 'vitest';

import { StoreScopeManager, type SyncEvent } from '@wcpos/sync-core';

import { createMaintenanceLanes } from './maintenance-lanes';
import { censusTotalsFromCache } from '../scheduler';

import type { LocalCoverage } from '../local-coverage/local-coverage';

const emptyReconcileSummary = {
	buckets: 0,
	emptyBuckets: 0,
	pruned: 0,
	missing: 0,
	changed: 0,
	skippedDirty: 0,
};

async function starvationHarness() {
	let nowMs = 1_000;
	let pressure = false;
	let retryAfterActive = false;
	const database = {
		listCollections: () => [],
		resetCollection: async () => undefined,
		pendingMutationCount: async () => 0,
		close: async () => undefined,
	};
	const manager = new StoreScopeManager({ createDatabase: async () => database });
	await manager.switchTo('scope');
	const primeManifest = vi.fn<LocalCoverage['primeManifest']>(async () => ({
		products: 0,
		customers: 0,
		orders: 0,
	}));
	const reconcilePass = vi.fn<LocalCoverage['reconcilePass']>(async () => emptyReconcileSummary);
	const coverage = { primeManifest, reconcilePass } as unknown as LocalCoverage;
	const diagnostics: SyncEvent[] = [];
	const lanes = createMaintenanceLanes({
		manager,
		databaseFor: () => database as never,
		coverageFor: () => coverage,
		syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
		fetcher: async () => Response.json({}),
		connectivity: () => 'online',
		diagnostics: (event) => diagnostics.push(event),
		ownerId: () => 'owner',
		censusFreshForMs: 60_000,
		customerTrickleStateFor: () => ({
			get: async () => null,
			set: async () => undefined,
		}),
		censusTotals: async () => censusTotalsFromCache([], nowMs),
		customerCensusTotal: async () => null,
		productTrickleStateFor: () => ({
			get: async () => null,
			set: async () => undefined,
		}),
		productCensusTotal: async () => null,
		variationPrefetchStateFor: () => ({
			get: async () => null,
			set: async () => undefined,
		}),
		variationCensusTotal: async () => null,
		hasPendingInteractiveWork: () => false,
		isWritePlaneOwner: () => true,
		emitEvent: () => undefined,
		now: () => nowMs,
		isServerBackingOff: () => pressure || retryAfterActive,
		isServerRetryAfterActive: () => retryAfterActive,
	});

	return {
		lanes,
		primeManifest,
		reconcilePass,
		diagnostics,
		advance: (durationMs: number) => {
			nowMs += durationMs;
		},
		setPressure: (value: boolean) => {
			pressure = value;
		},
		setRetryAfterActive: (value: boolean) => {
			retryAfterActive = value;
		},
	};
}

describe('maintenance lane starvation ceiling (mono#1159)', () => {
	it('starts bounded existence work on the first pressured tick and keeps normal cadence', async () => {
		const context = await starvationHarness();
		context.setPressure(true);
		await expect(context.lanes.existencePrime.tick()).resolves.toMatchObject({ status: 'ran' });
		await expect(context.lanes.existenceReconcile.tick()).resolves.toMatchObject({ status: 'ran' });
		context.advance(15 * 60_000 - 1);
		await expect(context.lanes.existencePrime.tick()).resolves.toMatchObject({ status: 'skipped' });
		await expect(context.lanes.existenceReconcile.tick()).resolves.toMatchObject({
			status: 'skipped',
		});
		context.advance(1);
		await expect(context.lanes.existencePrime.tick()).resolves.toMatchObject({ status: 'ran' });
		context.advance(2 * 60_000);
		await expect(context.lanes.existenceReconcile.tick()).resolves.toMatchObject({ status: 'ran' });
		expect(context.primeManifest).toHaveBeenCalledTimes(2);
		expect(context.reconcilePass).toHaveBeenCalledTimes(2);
	});

	it('runs one reduced existence-prime tick at its normal cadence, then defers again', async () => {
		const context = await starvationHarness();
		await expect(context.lanes.existencePrime.tick()).resolves.toMatchObject({ status: 'ran' });
		context.primeManifest.mockClear();
		context.setPressure(true);
		context.advance(15 * 60_000 + 1);

		await expect(context.lanes.existencePrime.tick()).resolves.toMatchObject({ status: 'ran' });
		expect(context.primeManifest).toHaveBeenCalledWith(expect.any(Object), { maxChunks: 1 });
		expect(context.diagnostics).toContainEqual(
			expect.objectContaining({
				type: 'maintenance.lane.tick',
				fields: { lane: 'existence-prime', starvation: true },
			})
		);
		await expect(context.lanes.existencePrime.tick()).resolves.toMatchObject({
			status: 'skipped',
			reason: 'server-pressure',
		});
		expect(context.primeManifest).toHaveBeenCalledOnce();
	});

	it('disables inner pressure deferral and bounds a starvation reconcile tick', async () => {
		const context = await starvationHarness();
		await expect(context.lanes.existenceReconcile.tick()).resolves.toMatchObject({ status: 'ran' });
		context.reconcilePass.mockClear();
		context.setPressure(true);
		context.advance(17 * 60_000 + 1);

		await expect(context.lanes.existenceReconcile.tick()).resolves.toMatchObject({ status: 'ran' });
		expect(context.reconcilePass).toHaveBeenCalledOnce();
		const [, , shouldDefer, options] = context.reconcilePass.mock.calls[0]!;
		expect(shouldDefer).toEqual(expect.any(Function));
		expect(shouldDefer!()).toBe(false);
		context.setRetryAfterActive(true);
		expect(shouldDefer!()).toBe(true);
		context.setRetryAfterActive(false);
		expect(options).toEqual({ maxScanPagesPerSpace: 1, maxDrillDowns: 1 });
		await expect(context.lanes.existenceReconcile.tick()).resolves.toMatchObject({
			status: 'skipped',
			reason: 'server-pressure',
		});
		expect(context.reconcilePass).toHaveBeenCalledOnce();
	});

	it('waits for an active Retry-After window even on the first pressured tick', async () => {
		const context = await starvationHarness();
		context.setPressure(true);
		context.setRetryAfterActive(true);
		await expect(context.lanes.existencePrime.tick()).resolves.toMatchObject({ status: 'skipped' });
		await expect(context.lanes.existenceReconcile.tick()).resolves.toMatchObject({
			status: 'skipped',
		});
		expect(context.primeManifest).not.toHaveBeenCalled();
		expect(context.reconcilePass).not.toHaveBeenCalled();
		context.setRetryAfterActive(false);
		await expect(context.lanes.existencePrime.tick()).resolves.toMatchObject({ status: 'ran' });
		await expect(context.lanes.existenceReconcile.tick()).resolves.toMatchObject({ status: 'ran' });
	});

	it('re-arms the ceiling when a starvation tick fails', async () => {
		const context = await starvationHarness();
		await expect(context.lanes.existencePrime.tick()).resolves.toMatchObject({ status: 'ran' });
		context.primeManifest.mockClear();
		context.setPressure(true);
		context.advance(15 * 60_000 + 1);
		context.primeManifest.mockRejectedValueOnce(new Error('server unavailable'));

		await expect(context.lanes.existencePrime.tick()).resolves.toMatchObject({ status: 'error' });
		await expect(context.lanes.existencePrime.tick()).resolves.toMatchObject({
			status: 'skipped',
			reason: 'server-pressure',
		});
		expect(context.primeManifest).toHaveBeenCalledOnce();
	});

	it('reserves the starvation window before a concurrent tick can enter', async () => {
		const context = await starvationHarness();
		await expect(context.lanes.existencePrime.tick()).resolves.toMatchObject({ status: 'ran' });
		context.primeManifest.mockClear();
		context.setPressure(true);
		context.advance(15 * 60_000 + 1);
		let releasePrime: (() => void) | undefined;
		let markPrimeStarted: (() => void) | undefined;
		const primeStarted = new Promise<void>((resolve) => {
			markPrimeStarted = resolve;
		});
		context.primeManifest.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					markPrimeStarted!();
					releasePrime = () => resolve({ products: 0, customers: 0, orders: 0 });
				})
		);

		const firstTick = context.lanes.existencePrime.tick();
		await primeStarted;
		const concurrentReport = await context.lanes.existencePrime.tick();
		releasePrime!();
		const firstReport = await firstTick;

		expect(concurrentReport).toMatchObject({
			status: 'skipped',
			reason: 'server-pressure',
		});
		expect(context.primeManifest).toHaveBeenCalledOnce();
		expect(firstReport).toMatchObject({ status: 'ran' });
	});
});
