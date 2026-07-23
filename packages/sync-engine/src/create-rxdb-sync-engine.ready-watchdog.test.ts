import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import type { SyncEvent } from '@wcpos/sync-core';

import { createRxdbSyncEngine, type RxdbSyncEnginePorts } from './create-rxdb-sync-engine';
import { memoryEngineStorage } from './testing';

setPremiumFlag();

const SITE = 'https://lab.example.test';
const SYNC_BASE = `${SITE}/wp-json/wcpos/v2`;
let uniqueStore = 0;

function engineWith(events: SyncEvent[], overrides: Partial<RxdbSyncEnginePorts> = {}) {
	uniqueStore += 1;
	return createRxdbSyncEngine(
		{
			site: { syncBaseUrl: SYNC_BASE, wpJsonRoot: `${SITE}/wp-json` },
			storage: memoryEngineStorage(),
			mode: 'manual',
			diagnostics: (event) => events.push(event),
			...overrides,
		},
		{ site: SITE, storeId: 1, cashierId: `ready-watchdog-${uniqueStore}` }
	);
}

const ofType = (events: SyncEvent[], type: string) => events.filter((event) => event.type === type);

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('RxdbSyncEngine readiness watchdog', () => {
	it('names the blocked phase, repeatedly, while the initial open hangs', async () => {
		vi.useFakeTimers();
		const events: SyncEvent[] = [];
		// A barrier that never resolves = a deterministic silent hang inside the
		// open chain (the production shape: a stuck storage worker or migration).
		const engine = engineWith(events, { databaseOpenBarrier: new Promise<void>(() => {}) });

		await vi.advanceTimersByTimeAsync(14_999);
		expect(ofType(events, 'engine.ready-stalled')).toHaveLength(0);

		await vi.advanceTimersByTimeAsync(1);
		const first = ofType(events, 'engine.ready-stalled');
		expect(first).toHaveLength(1);
		expect(first[0]!.level).toBe('error');
		expect(first[0]!.fields).toMatchObject({ phase: 'database-open-barrier' });
		expect(first[0]!.message).toContain('database-open-barrier');

		await vi.advanceTimersByTimeAsync(60_000);
		expect(ofType(events, 'engine.ready-stalled')).toHaveLength(2);

		// Dispose is deliberate teardown, not a stall — reports stop immediately
		// (dispose itself queues behind the hung open, so it is not awaited here).
		void engine.dispose().catch(() => undefined);
		await vi.advanceTimersByTimeAsync(600_000);
		expect(ofType(events, 'engine.ready-stalled')).toHaveLength(2);
	});

	it('reports a failed initial open with the phase it failed in', async () => {
		const events: SyncEvent[] = [];
		const engine = engineWith(events, {
			storage: () => {
				throw new Error('storage exploded');
			},
		});

		await expect(engine.ready).rejects.toThrow(/storage exploded/);

		const failed = ofType(events, 'engine.ready-failed');
		expect(failed).toHaveLength(1);
		expect(failed[0]!.level).toBe('error');
		expect(failed[0]!.fields).toMatchObject({ phase: 'create-database' });
		expect(failed[0]!.message).toContain('storage exploded');
		expect(ofType(events, 'engine.ready')).toHaveLength(0);

		await engine.dispose();
	});

	it('emits engine.ready with the boot duration and clears the watchdog on success', async () => {
		const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
		const events: SyncEvent[] = [];
		const engine = engineWith(events);

		await engine.ready;
		// The engine.ready emit runs on the settle microtask alongside this await.
		await Promise.resolve();

		const readyEvents = ofType(events, 'engine.ready');
		expect(readyEvents).toHaveLength(1);
		expect(readyEvents[0]!.level).toBe('info');
		expect(typeof readyEvents[0]!.fields?.durationMs).toBe('number');
		expect(ofType(events, 'engine.ready-stalled')).toHaveLength(0);
		expect(ofType(events, 'engine.ready-failed')).toHaveLength(0);
		// The pending 15s stall timer was cleared when ready settled.
		expect(clearTimeoutSpy).toHaveBeenCalled();

		await engine.dispose();
	});
});
