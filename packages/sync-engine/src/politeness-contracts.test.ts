// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { scopeKeyFor, type StoreScopeIdentity } from '@wcpos/sync-core';

import { createEngineHarness, memoryStringStore } from './testing';
import { LANE_REGISTRY } from './maintenance/lane-registry';

import type { EngineHarness } from './engine-harness';

setPremiumFlag();

const SITE = 'https://polite.example.test';
let nextIdentity = 0;

function identity(): StoreScopeIdentity {
	nextIdentity += 1;
	return { site: SITE, storeId: 1, cashierId: `polite-${nextIdentity}` };
}

function json(body: unknown, headers?: Record<string, string>): Response {
	return Response.json(body, { headers });
}

function scanEnvelope(url: string): unknown {
	const parsed = new URL(url);
	const collection = parsed.searchParams.get('collection') ?? 'products';
	const bucketSize = Number(parsed.searchParams.get('bucket_size'));
	return {
		collection,
		checkpoint: { bucket_size: bucketSize, after_id: bucketSize },
		changes:
			collection === 'products'
				? [
						{
							bucket: 0,
							stored_count: 1,
							current_count: 1,
							stored_digest: '1',
							current_digest: '2',
							match: false,
						},
					]
				: [],
		complete: true,
		meta: {},
	};
}

function product(wooId: number): Record<string, unknown> {
	return {
		id: `00000000-0000-4000-8000-${String(wooId).padStart(12, '0')}`,
		wooProductId: wooId,
		price: 1,
		stockStatus: 'instock',
		type: 'simple',
		categoryIds: [],
		brandIds: [],
		onSale: false,
		featured: false,
		stockQuantity: null,
		payload: { id: wooId, status: 'publish' },
		sync: { revision: '1', partial: false, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	};
}

async function seedPopulatedStore(harness: EngineHarness): Promise<void> {
	await harness.seed('products', [product(1)]);
	await harness.seed('existenceManifest', [
		{ id: '1', wooId: 1, digest: '1', objectType: 'product' },
	]);
}

function defaultResponse(url: string): Response {
	const parsed = new URL(url);
	const path = parsed.pathname;
	if (path.endsWith('/changes/sequence-log')) {
		return json({ changes: [], checkpoint: { since: 9_000, head: 9_000 }, complete: true });
	}
	if (path.endsWith('/changes/range-checksum')) return json({ changes: [], complete: true });
	if (path.endsWith('/integrity/scan')) return json(scanEnvelope(url));
	if (path.endsWith('/integrity/bucket')) {
		return json({ ids: [{ id: 1, digest: '1', object_type: 'product' }] });
	}
	if (path.endsWith('/digests')) return json({ digests: [] });
	return json([], { 'X-WP-TotalPages': '1', 'X-WP-Total': '0' });
}

async function autoRebaselineHarness(): Promise<EngineHarness> {
	const scope = identity();
	const checkpoints = memoryStringStore();
	await checkpoints.set(
		`${scopeKeyFor(scope)}:checkpoint:change-signal`,
		JSON.stringify({ cursor: { sequence: 0 }, baselineDigests: [] })
	);
	const harness = await createEngineHarness({
		site: SITE,
		identity: scope,
		mode: 'auto',
		checkpoints,
		captureTimers: true,
		fetch: async (url) => defaultResponse(url),
	});
	await vi.waitFor(() =>
		expect(harness.timers!.timeouts.some(({ delayMs }) => delayMs === 10_000)).toBe(true)
	);
	await seedPopulatedStore(harness);
	return harness;
}

function fireChangeSignal(harness: EngineHarness): void {
	const index = harness.timers!.timeouts.findIndex(({ delayMs }) => delayMs === 10_000);
	if (index < 0) throw new Error('change-signal timer not armed');
	harness.timers!.fireTimeout(index);
}

describe('maintenance politeness contracts', () => {
	it('opens the product window before audit traffic and keeps the rebaseline under declared bounds', async () => {
		const harness = await autoRebaselineHarness();
		try {
			harness.requests.length = 0;
			harness.events.length = 0;
			let requestsAtProductSeedFinish: number | null = null;
			const unsubscribe = harness.engine.events((event) => {
				if (event.type === 'lane-finish' && event.lane === 'product-browse-window-seed') {
					requestsAtProductSeedFinish = harness.requests.length;
				}
			});
			const baseline = harness.requests.length;
			fireChangeSignal(harness);
			await vi.waitFor(() => expect(requestsAtProductSeedFinish).not.toBeNull());
			expect(
				harness.requests
					.slice(baseline, requestsAtProductSeedFinish!)
					.filter((request) => /\/integrity\/|\/digests$/.test(request.path))
			).toEqual([]);
			expect(
				harness.events.some(
					(event) => event.type === 'lane-start' && event.lane === 'existence-prime'
				)
			).toBe(false);

			// A due 15-min existence-prime interval firing INSIDE the hold must stand down
			// (codex-review P2): the interval-dispatched tick skips, issues nothing, and the
			// audit still arrives only through the held chain.
			const requestsBeforeInterval = harness.requests.length;
			const primeInterval = harness.timers!.intervals.findIndex(
				({ delayMs }) => delayMs === 15 * 60_000
			);
			expect(primeInterval).toBeGreaterThanOrEqual(0);
			harness.timers!.fireInterval(primeInterval);
			await vi.waitFor(() =>
				expect(
					harness.events.some(
						(event) =>
							event.type === 'lane-finish' &&
							event.lane === 'existence-prime' &&
							event.status === 'skipped'
					)
				).toBe(true)
			);
			expect(
				harness.requests
					.slice(requestsBeforeInterval)
					.filter((request) => /\/integrity\/|\/digests$/.test(request.path))
			).toEqual([]);

			const delayIndex = harness.timers!.timeouts.findIndex(({ delayMs }) => delayMs === 60_000);
			expect(delayIndex).toBeGreaterThanOrEqual(0);
			harness.timers!.fireTimeout(delayIndex);
			await vi.waitFor(() =>
				expect(
					harness.events.some(
						(event) => event.type === 'lane-finish' && event.lane === 'existence-reconcile'
					)
				).toBe(true)
			);
			const declaredWindowBound = LANE_REGISTRY.filter(
				(entry) => entry.owner === 'maintenance' && entry.maxRequestsPerTick !== null
			).reduce((sum, entry) => sum + entry.maxRequestsPerTick, 0);
			const maintenanceRequests = harness.requests
				.slice(baseline)
				.filter((request) => !request.path.includes('/changes/'));
			expect(maintenanceRequests.length).toBeLessThanOrEqual(declaredWindowBound);
			unsubscribe();
		} finally {
			await harness.dispose();
		}
	});

	it('cancels a delayed audit on scope switch without a stale post-switch tick', async () => {
		const harness = await autoRebaselineHarness();
		try {
			harness.events.length = 0;
			fireChangeSignal(harness);
			await vi.waitFor(() =>
				expect(harness.timers!.timeouts.some(({ delayMs }) => delayMs === 60_000)).toBe(true)
			);
			const delayed = harness.timers!.timeouts.find(({ delayMs }) => delayMs === 60_000)!;
			await harness.engine.scope.switch(identity());
			expect(harness.timers!.timeouts).not.toContainEqual(delayed);
			delayed.callback();
			await Promise.resolve();
			expect(
				harness.events.some(
					(event) => event.type === 'lane-start' && event.lane === 'existence-prime'
				)
			).toBe(false);
		} finally {
			await harness.dispose();
		}
	});

	it('stops between buckets under pressure, preserves demand lanes, and resumes after recovery', async () => {
		let harness!: EngineHarness;
		let injectPressure = true;
		const bucketRequests: number[] = [];
		harness = await createEngineHarness({
			site: SITE,
			mode: 'manual',
			fetch: async (url) => {
				const parsed = new URL(url);
				if (parsed.pathname.endsWith('/integrity/scan')) {
					const envelope = scanEnvelope(url) as Record<string, unknown>;
					envelope['changes'] = [0, 1, 2].map((bucket) => ({
						bucket,
						stored_count: 1,
						current_count: 1,
						stored_digest: '1',
						current_digest: '2',
						match: false,
					}));
					return json(envelope);
				}
				if (parsed.pathname.endsWith('/integrity/bucket')) {
					bucketRequests.push(Number(parsed.searchParams.get('bucket')));
					if (injectPressure) {
						injectPressure = false;
						await harness.engine.hostTransport().fetcher(`${SITE}/pressure`);
					}
					return json({ ids: [{ id: bucketRequests.at(-1)! * 1_000 + 1, digest: '1' }] });
				}
				if (parsed.pathname.endsWith('/pressure')) return new Response(null, { status: 429 });
				return defaultResponse(url);
			},
		});
		try {
			await harness.seed(
				'existenceManifest',
				[0, 1, 2].map((bucket) => ({
					id: String(bucket * 1_000 + 1),
					wooId: bucket * 1_000 + 1,
					digest: '1',
					objectType: 'product',
				}))
			);
			await expect(harness.engine.sync('existence-reconcile')).resolves.toMatchObject({
				status: 'skipped',
				reason: 'server-pressure',
			});
			expect(bucketRequests).toEqual([0]);
			await expect(harness.engine.sync('existence-prime')).resolves.toMatchObject({
				reason: 'server-pressure',
			});
			expect((await harness.engine.sync('change-signal')).reason).not.toBe('server-pressure');
			expect((await harness.engine.sync('write-drain')).reason).not.toBe('server-pressure');

			harness.clock.advance(60_000);
			for (let index = 0; index < 10; index += 1) {
				await harness.engine.hostTransport().fetcher(`${SITE}/healthy`);
			}
			await expect(harness.engine.sync('existence-reconcile')).resolves.toMatchObject({
				status: 'ran',
			});
			// The deferred bucket 1 is the FIRST re-selected after recovery — the cursor
			// commits only completed drills, so the promised remainder resumes, not skips
			// (codex-review P1).
			expect(bucketRequests).toEqual([0, 1, 2]);
		} finally {
			await harness.dispose();
		}
	});

	it('keeps every bounded maintenance lane at or below its registry declaration', async () => {
		let queryTotalRequests = 0;
		const harness = await createEngineHarness({
			site: SITE,
			mode: 'manual',
			queryTotal: {
				fetchWooQueryTotal: async () => {
					queryTotalRequests += 1;
					return 0;
				},
			},
			fetch: async (url) => defaultResponse(url),
		});
		try {
			await seedPopulatedStore(harness);
			const maintenanceEntries = LANE_REGISTRY.filter((entry) => entry.owner === 'maintenance');
			expect(maintenanceEntries.every((entry) => entry.maxRequestsPerTick !== null)).toBe(true);
			for (const entry of maintenanceEntries) {
				const before = harness.requests.length + queryTotalRequests;
				await harness.engine.sync(entry.laneName);
				const observed = harness.requests.length + queryTotalRequests - before;
				expect(observed, entry.laneName).toBeLessThanOrEqual(entry.maxRequestsPerTick!);
			}
		} finally {
			await harness.dispose();
		}
	});
});
