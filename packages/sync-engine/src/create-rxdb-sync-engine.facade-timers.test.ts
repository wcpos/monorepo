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

function captureIntervals(): CapturedInterval[] {
	const intervals: CapturedInterval[] = [];
	let nextHandle = 1;
	vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void, delay: number) => {
		const handle = nextHandle++ as unknown as ReturnType<typeof setInterval>;
		intervals.push({ callback, delay, handle });
		return handle;
	}) as typeof setInterval);
	vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => undefined);
	return intervals;
}

async function waitForAutomaticIntervals(intervals: CapturedInterval[]): Promise<void> {
	await vi.waitFor(() => expect(intervals).toHaveLength(9));
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('RxdbSyncEngine facade timers and live configuration', () => {
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
			id: orderId,
			wooOrderId: null,
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

	it('arms and advances each automatic lane nextDueAtMs on fixed interval boundaries', async () => {
		let nowMs = 1_000;
		const captured = captureIntervals();
		const engine = engineWith({
			mode: 'auto',
			now: () => nowMs,
		});

		await engine.ready;
		await waitForAutomaticIntervals(captured);
		expect(engine.status().lanes['change-signal'].nextDueAtMs).toBe(11_000);
		nowMs = 40_000;
		captured[0]!.callback();
		expect(engine.status().lanes['change-signal'].nextDueAtMs).toBe(21_000);
		await engine.dispose();

		const manual = engineWith({ mode: 'manual' });
		await manual.ready;
		expect(manual.status().lanes['change-signal'].nextDueAtMs).toBeUndefined();
		await manual.dispose();
	});

	it('re-arms only the live change-signal timer, clamps its cadence, and is idempotent', async () => {
		let nowMs = 5_000;
		const captured = captureIntervals();
		const engine = engineWith({ mode: 'auto', now: () => nowMs });

		await engine.ready;
		await waitForAutomaticIntervals(captured);
		const initialChangeTimer = captured[0]!;
		nowMs = 8_000;
		engine.reconfigure({ changeSignalPollMs: 1 });
		expect(clearInterval).toHaveBeenCalledExactlyOnceWith(initialChangeTimer.handle);
		expect(captured.at(-1)?.delay).toBe(5_000);
		expect(engine.status().lanes['change-signal'].nextDueAtMs).toBe(13_000);
		engine.reconfigure({ changeSignalPollMs: 1 });
		expect(clearInterval).toHaveBeenCalledTimes(1);
		nowMs = 9_000;
		engine.reconfigure({ changeSignalPollMs: 500_000 });
		expect(clearInterval).toHaveBeenCalledTimes(2);
		expect(captured.at(-1)?.delay).toBe(300_000);
		expect(engine.status().lanes['change-signal'].nextDueAtMs).toBe(309_000);
		await engine.dispose();
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

			const scope = await engine.ready;
			await seedOrderSchedulerTasks({
				perPage: 250,
				nowMs: 1,
				getRepository: async () => ({ getDatabase: () => scope.database.collections as never }),
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
		const captured = captureIntervals();
		const connectivity = scriptedConnectivity('offline');
		const diagnostics = vi.fn();
		const engine = engineWith({
			mode: 'auto',
			connectivity: connectivity.signal,
			diagnostics,
		});
		const events: EngineEvent[] = [];
		engine.events((event) => events.push(event));
		const statuses: EngineStatus[] = [];
		engine.statusChanges((status) => statuses.push(status));

		await engine.ready;
		await waitForAutomaticIntervals(captured);
		events.length = 0;
		connectivity.set('online');
		captured[0]!.callback();
		captured.find(({ delay }) => delay === 60_000)!.callback();
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
