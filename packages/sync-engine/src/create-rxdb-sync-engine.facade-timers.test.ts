import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { normalizeCheckpoint } from '@wcpos/sync-core';

import {
	createRxdbSyncEngine,
	type EngineEvent,
	type EngineStatus,
	type RxdbSyncEnginePorts,
} from './create-rxdb-sync-engine';
import { seedOrderSchedulerTasks } from './scheduler/rx-order-scheduler-task-seeder';
import { memoryEngineStorage, scriptedConnectivity } from './testing';

setPremiumFlag();

const SITE = 'https://lab.example.test';
const SYNC_BASE = `${SITE}/wp-json/wcpos/v2`;
let uniqueStore = 0;

function engineWith(overrides: Partial<RxdbSyncEnginePorts> = {}) {
	uniqueStore += 1;
	return createRxdbSyncEngine(
		{
			site: { syncBaseUrl: SYNC_BASE, wpJsonRoot: `${SITE}/wp-json` },
			storage: memoryEngineStorage(),
			mode: 'manual',
			fetcher: async () =>
				new Response(JSON.stringify([]), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
			...overrides,
		},
		{ site: SITE, storeId: 1, cashierId: `facade-timers-${uniqueStore}` }
	);
}

type CapturedInterval = {
	callback: () => void;
	delay: number;
	handle: ReturnType<typeof setInterval>;
};

type CapturedTimeout = {
	callback: () => void;
	delay: number;
	handle: ReturnType<typeof setTimeout>;
};

function captureTimers(): {
	intervals: CapturedInterval[];
	timeouts: CapturedTimeout[];
	clearedTimeouts: Set<Parameters<typeof clearTimeout>[0]>;
} {
	const intervals: CapturedInterval[] = [];
	const timeouts: CapturedTimeout[] = [];
	const clearedTimeouts = new Set<Parameters<typeof clearTimeout>[0]>();
	let nextHandle = 1;
	vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, delay: number) => {
		const handle = nextHandle++ as unknown as ReturnType<typeof setInterval>;
		intervals.push({ callback, delay, handle });
		return handle;
	}) as typeof setInterval);
	vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);
	const realSetTimeout = globalThis.setTimeout;
	const realClearTimeout = globalThis.clearTimeout;
	vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, delay: number) => {
		const handle = realSetTimeout(callback, delay);
		timeouts.push({ callback, delay, handle });
		return handle;
	}) as typeof setTimeout);
	vi.spyOn(globalThis, 'clearTimeout').mockImplementation((handle) => {
		clearedTimeouts.add(handle);
		realClearTimeout(handle);
	});
	return { intervals, timeouts, clearedTimeouts };
}

async function waitForAutomaticIntervals(intervals: CapturedInterval[]): Promise<void> {
	await vi.waitFor(() => expect(intervals).toHaveLength(11));
}

function changeSignalTimeout(
	engine: ReturnType<typeof engineWith>,
	timeouts: CapturedTimeout[],
	nowMs: number
): CapturedTimeout {
	const delay = engine.status().lanes['change-signal'].nextDueAtMs! - nowMs;
	for (let index = timeouts.length - 1; index >= 0; index -= 1) {
		if (timeouts[index]!.delay === delay) return timeouts[index]!;
	}
	throw new Error(`change-signal timeout with delay ${delay} not found`);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('RxdbSyncEngine facade timers and live configuration', () => {
	it('publishes per-collection activity and monotonic reset/switch generations', async () => {
		const engine = engineWith();
		await engine.ready;

		expect(Object.keys(engine.status().collections)).toEqual([
			'orders',
			'products',
			'variations',
			'customers',
			'taxRates',
			'categories',
			'brands',
			'tags',
			'coupons',
		]);
		const initialGeneration = engine.status().collections.products.coverageGeneration;
		expect(engine.status().collections.products).toEqual({
			active: false,
			coverageGeneration: initialGeneration,
		});

		await engine.scope.resetCollection('products').then(() => {
			// The generation is already visible when resetCollection resolves.
			expect(engine.status().collections.products.coverageGeneration).toBe(initialGeneration + 1);
		});

		await engine.scope.switch({
			site: SITE,
			storeId: 1,
			cashierId: 'generation-switch',
		});
		for (const state of Object.values(engine.status().collections)) {
			expect(state.coverageGeneration).toBeGreaterThanOrEqual(1);
		}
		expect(engine.status().collections.products.coverageGeneration).toBe(initialGeneration + 2);

		await engine.dispose();
		expect(engine.status().collections.products).toEqual({
			active: false,
			coverageGeneration: initialGeneration + 2,
		});
	});

	it('publishes current and coalesced status changes, then unsubscribes', async () => {
		const engine = engineWith();
		const statuses: EngineStatus[] = [];
		const unsubscribe = engine.statusChanges((status) => statuses.push(status));

		expect(statuses).toHaveLength(1);
		expect(statuses[0]).toEqual(engine.status());

		await engine.ready;
		await vi.waitFor(() => expect(statuses.at(-1)?.activeScopeId).not.toBeNull());

		const beforeReconfigure = statuses.length;
		engine.reconfigure({ pullBatchSize: 20 });
		engine.reconfigure({ pullBatchSize: 30 });
		expect(statuses).toHaveLength(beforeReconfigure);
		await vi.waitFor(() => expect(statuses).toHaveLength(beforeReconfigure + 1));

		await engine.sync('change-signal');
		await vi.waitFor(() => expect(statuses.at(-1)?.lanes['change-signal'].lastTick).not.toBeNull());

		const beforeReset = statuses.length;
		await engine.scope.resetCollection('products');
		await vi.waitFor(() => expect(statuses.length).toBeGreaterThan(beforeReset));

		const active = engine.active();
		if (!active) throw new Error('expected an active scope');
		const orderId = '10000000-0000-4000-8000-000000000001';
		await active.database.collections.orders.insert({
			uuid: orderId,
			remoteId: null,
			number: '',
			dateCreatedGmt: '2026-07-16T00:00:00',
			status: 'pos-open',
			total: '0.00',
			customerId: 0,
			payload: { status: 'pos-open' },
			sync: { revision: '', partial: false, source: 'skeleton' },
			local: { dirty: false, pendingMutationIds: [] },
		});
		await engine.write({
			collection: 'orders',
			operation: 'create',
			recordId: orderId,
			payload: { status: 'pos-open' },
		});
		await vi.waitFor(() => expect(statuses.at(-1)?.queueDepth).toBe(1));

		unsubscribe();
		const afterUnsubscribe = statuses.length;
		engine.reconfigure({ pullBatchSize: 40 });
		await Promise.resolve();
		expect(statuses).toHaveLength(afterUnsubscribe);
		await engine.dispose();
	});

	it('a gated automatic tick names the skip instead of vanishing (#1348)', async () => {
		const captured = captureTimers();
		const engine = engineWith({ mode: 'auto', now: () => 1_000, random: () => 0.5 });
		const events: EngineEvent[] = [];
		engine.events((event) => events.push(event));
		await engine.ready;
		await waitForAutomaticIntervals(captured.intervals);

		// Hold the lifecycle gate open: pendingLifecycleOps increments synchronously
		// when the switch enqueues, before the op itself runs.
		const switching = engine.scope.switch({
			site: SITE,
			storeId: 1,
			cashierId: 'gate-probe',
		});
		const before = events.length;
		// A due lane interval firing inside the hold — the field shape that used to
		// produce NO lane events at all (observed live 2026-08-19, flagged on #1318).
		captured.intervals[0]!.callback();
		const emitted = events.slice(before);
		expect(emitted).toHaveLength(2);
		expect(emitted[0]).toEqual({ type: 'lane-start', lane: expect.any(String) });
		expect(emitted[1]).toEqual({
			type: 'lane-finish',
			lane: (emitted[0] as { lane: string }).lane,
			status: 'skipped',
			detail: 'lifecycle-gated',
		});

		await switching;
		await engine.dispose();
	});

	it('arms and advances each automatic lane nextDueAtMs on fixed interval boundaries', async () => {
		let nowMs = 1_000;
		const captured = captureTimers();
		const engine = engineWith({
			mode: 'auto',
			now: () => nowMs,
			random: () => 0.5,
		});

		await engine.ready;
		await waitForAutomaticIntervals(captured.intervals);
		expect(engine.status().lanes['change-signal'].nextDueAtMs).toBe(11_000);
		expect(engine.status().lanes['customer-trickle'].nextDueAtMs).toBe(301_000);
		expect(engine.status().lanes['variation-prefetch'].nextDueAtMs).toBe(301_000);
		expect(engine.status().lanes['customer-trickle'].lastTick).toBeNull();
		expect(engine.status().lanes['product-trickle'].nextDueAtMs).toBe(301_000);
		expect(engine.status().lanes['product-trickle'].lastTick).toBeNull();
		nowMs = 40_000;
		changeSignalTimeout(engine, captured.timeouts, 1_000).callback();
		expect(engine.status().lanes['change-signal'].nextDueAtMs).toBe(50_000);
		await engine.dispose();

		const manual = engineWith({ mode: 'manual' });
		await manual.ready;
		expect(manual.status().lanes['change-signal'].nextDueAtMs).toBeUndefined();
		await manual.dispose();
	});

	it('re-arms only the live change-signal timer, clamps its cadence, and is idempotent', async () => {
		let nowMs = 5_000;
		const captured = captureTimers();
		const engine = engineWith({
			mode: 'auto',
			now: () => nowMs,
			random: () => 0.5,
		});

		await engine.ready;
		await waitForAutomaticIntervals(captured.intervals);
		const initialChangeTimer = changeSignalTimeout(engine, captured.timeouts, nowMs);
		nowMs = 8_000;
		engine.reconfigure({ changeSignalPollMs: 1 });
		expect(captured.clearedTimeouts).toContain(initialChangeTimer.handle);
		const clampedFastTimer = changeSignalTimeout(engine, captured.timeouts, nowMs);
		expect(clampedFastTimer.delay).toBe(5_000);
		expect(engine.status().lanes['change-signal'].nextDueAtMs).toBe(13_000);
		engine.reconfigure({ changeSignalPollMs: 1 });
		expect(changeSignalTimeout(engine, captured.timeouts, nowMs).handle).toBe(
			clampedFastTimer.handle
		);
		nowMs = 9_000;
		engine.reconfigure({ changeSignalPollMs: 500_000 });
		expect(captured.clearedTimeouts).toContain(clampedFastTimer.handle);
		expect(changeSignalTimeout(engine, captured.timeouts, nowMs).delay).toBe(300_000);
		expect(engine.status().lanes['change-signal'].nextDueAtMs).toBe(309_000);
		await engine.dispose();
	});

	it('steps idle cadence to 30s, then 60s and holds', async () => {
		let nowMs = 10 * 60_000 + 1;
		const captured = captureTimers();
		const engine = engineWith({
			mode: 'auto',
			now: () => nowMs,
			random: () => 0.5,
			lastUserActivityMs: () => 1,
		});

		await engine.ready;
		await waitForAutomaticIntervals(captured.intervals);
		let timer = changeSignalTimeout(engine, captured.timeouts, nowMs);
		expect(timer.delay).toBe(30_000);

		nowMs += timer.delay;
		clearTimeout(timer.handle);
		timer.callback();
		timer = changeSignalTimeout(engine, captured.timeouts, nowMs);
		expect(timer.delay).toBe(60_000);

		nowMs += timer.delay;
		clearTimeout(timer.handle);
		timer.callback();
		expect(changeSignalTimeout(engine, captured.timeouts, nowMs).delay).toBe(60_000);
		await engine.dispose();
	});

	it('starts at the active cadence when the activity timestamp is unset', async () => {
		const nowMs = 10 * 60_000;
		const captured = captureTimers();
		const engine = engineWith({
			mode: 'auto',
			now: () => nowMs,
			random: () => 0.5,
			lastUserActivityMs: () => 0,
		});

		await engine.ready;
		await waitForAutomaticIntervals(captured.intervals);
		expect(changeSignalTimeout(engine, captured.timeouts, nowMs).delay).toBe(10_000);
		await engine.dispose();
	});

	it('snaps a decayed timer back and immediately catches up on user activity', async () => {
		let nowMs = 10 * 60_000 + 1;
		let lastActivityMs = 1;
		let activityListener: (() => void) | null = null;
		const captured = captureTimers();
		const events: EngineEvent[] = [];
		const engine = engineWith({
			mode: 'auto',
			now: () => nowMs,
			random: () => 0.5,
			lastUserActivityMs: () => lastActivityMs,
			onUserActivity: (listener) => {
				activityListener = listener;
				return () => undefined;
			},
		});
		engine.events((event) => events.push(event));

		await engine.ready;
		await waitForAutomaticIntervals(captured.intervals);
		expect(changeSignalTimeout(engine, captured.timeouts, nowMs).delay).toBe(30_000);
		events.length = 0;
		lastActivityMs = nowMs;
		activityListener!();

		expect(changeSignalTimeout(engine, captured.timeouts, nowMs).delay).toBe(10_000);
		await vi.waitFor(() =>
			expect(
				events.filter((event) => event.type === 'lane-finish' && event.lane === 'change-signal')
			).toHaveLength(1)
		);
		expect(
			events.filter((event) => event.type === 'lane-start' && event.lane === 'change-signal')
		).toHaveLength(1);
		await engine.dispose();
	});

	it('does not tick for activity while change-signal cadence is active', async () => {
		let activityListener: (() => void) | null = null;
		const captured = captureTimers();
		const events: EngineEvent[] = [];
		const engine = engineWith({
			mode: 'auto',
			random: () => 0.5,
			lastUserActivityMs: () => Date.now(),
			onUserActivity: (listener) => {
				activityListener = listener;
				return () => undefined;
			},
		});
		engine.events((event) => events.push(event));

		await engine.ready;
		await waitForAutomaticIntervals(captured.intervals);
		events.length = 0;
		activityListener!();
		await Promise.resolve();
		expect(
			events.filter(
				(event) =>
					(event.type === 'lane-start' || event.type === 'lane-finish') &&
					event.lane === 'change-signal'
			)
		).toHaveLength(0);
		await engine.dispose();
	});

	it('unsubscribes activity on dispose and ignores a captured listener afterward', async () => {
		let activityListener: (() => void) | null = null;
		const unsubscribe = vi.fn();
		const captured = captureTimers();
		const engine = engineWith({
			mode: 'auto',
			onUserActivity: (listener) => {
				activityListener = listener;
				return unsubscribe;
			},
		});

		await engine.ready;
		await waitForAutomaticIntervals(captured.intervals);
		await engine.dispose();

		expect(unsubscribe).toHaveBeenCalledTimes(1);
		expect(() => activityListener!()).not.toThrow();
	});

	it.each([
		{ configured: 1, expected: 10 },
		{ configured: 1_000, expected: 100 },
	])(
		'clamps pullBatchSize=$configured and sends it as the order pull limit',
		async ({ configured, expected }) => {
			const urls: string[] = [];
			const checkpoint = normalizeCheckpoint(null);
			const engine = engineWith({
				fetcher: async (url) => {
					urls.push(url);
					return new Response(JSON.stringify({ documents: [], checkpoint, hasMore: false }), {
						status: 200,
						headers: { 'content-type': 'application/json' },
					});
				},
			});

			const scope = await engine.whenActive();
			await seedOrderSchedulerTasks({
				perPage: 250,
				nowMs: 1,
				database: scope.database,
			});
			engine.reconfigure({ pullBatchSize: configured });
			await engine.sync('scheduler-drain');
			const pull = urls.find((url) => new URL(url).pathname.endsWith('/orders/pull'));
			expect(new URL(pull!).searchParams.get('limit')).toBe(String(expected));
			await engine.dispose();
		}
	);
});

describe('RxdbSyncEngine reconnect re-tick', () => {
	it('runs exactly one five-lane sweep for one offline-to-online automatic transition', async () => {
		const nowMs = 1_000;
		const captured = captureTimers();
		const connectivity = scriptedConnectivity('offline');
		const diagnostics = vi.fn();
		const engine = engineWith({
			mode: 'auto',
			now: () => nowMs,
			random: () => 0.5,
			connectivity: connectivity.signal,
			diagnostics,
		});
		const events: EngineEvent[] = [];
		engine.events((event) => events.push(event));
		const statuses: EngineStatus[] = [];
		engine.statusChanges((status) => statuses.push(status));

		await engine.ready;
		await waitForAutomaticIntervals(captured.intervals);
		events.length = 0;
		connectivity.set('online');
		changeSignalTimeout(engine, captured.timeouts, nowMs).callback();
		captured.intervals.find(({ delay }) => delay === 60_000)!.callback();
		// The sweep sequences seeds before drains (mirroring startup), so the
		// drain lanes land a few microtask turns after the trigger.
		await vi.waitFor(() => {
			for (const lane of [
				'reference-seed',
				'product-browse-window-seed',
				'order-window-seed',
				'scheduler-drain',
				'write-drain',
			] as const) {
				expect(
					events.filter((event) => event.type === 'lane-start' && event.lane === lane)
				).toHaveLength(1);
			}
		});
		expect(
			diagnostics.mock.calls.filter(([event]) => event.type === 'engine.reconnect.retick')
		).toHaveLength(1);
		expect(statuses.at(-1)?.connectivity).toBe('online');
		await engine.dispose();
	});
});
