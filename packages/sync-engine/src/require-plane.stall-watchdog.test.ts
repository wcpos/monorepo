/**
 * The require-plane pump is a SERIAL loop, so a single execution whose await never settles
 * used to starve every queued requirement forever, silently. Run 33445432662 (Android
 * phone, flow 07, 2026-08-31): after the last search outcome the pump completed ZERO
 * requirements for the job's final 38 minutes — the variations popover's targeted pull and
 * both of its forced syncs queued behind one stalled execution while every other engine
 * lane stayed healthy, and nothing was logged. These tests pin the stall watchdog that
 * turns that silent starvation into a logged, bounded abandonment.
 *
 * The pin tests deliberately import only `createRequirePlane` and spell the timeout as a
 * literal, so the lead test runs (and fails honestly) against the pre-watchdog code.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mintRemoteId, type SyncEvent } from '@wcpos/sync-core';

import { createRequirePlane } from './require-plane';

const STALL_TIMEOUT_MS = 90_000;

type LaneRead = () => Promise<unknown>;
type StubOverrides = {
	awaitReady?: () => Promise<void>;
	fetcher?: () => Promise<Response>;
};

/**
 * The smallest deps that let two real requirement kinds execute: a variations `search`
 * (whose serve-local gate reads `coverage.readLane` — the injected hang point) and a
 * variations `targeted-records` whose ids are all resident (serve-local, no wire).
 */
function stubPlane(input: { readLane: LaneRead } & StubOverrides) {
	const events: SyncEvent[] = [];
	const bound = {
		scopeId: 'scope-1',
		epoch: 1,
		signal: new AbortController().signal,
		bindFetch: (fetcher: unknown) => fetcher,
		guardWrite: async (write: () => Promise<void>) => {
			await write();
			return 'applied' as const;
		},
		isCurrent: () => true,
	};
	const database = {
		collections: {
			variations: {
				find: () => ({
					exec: async () => [{ toJSON: () => ({ remoteId: '101' }) }],
				}),
			},
		},
	};
	const plane = createRequirePlane({
		awaitReady: input.awaitReady ?? (async () => undefined),
		manager: {
			activeScope: 'scope-1',
			runGuarded: (operation: (scope: unknown) => Promise<unknown>) => operation(bound),
		} as never,
		databaseFor: () => database as never,
		coverageFor: () => ({ readLane: input.readLane }) as never,
		fetcher: (input.fetcher ?? (async () => new Response('[]'))) as never,
		syncBaseUrl: 'https://example.test/wp-json/wcpos/v2',
		diagnostics: (event) => {
			events.push(event);
		},
	});
	return { plane, events };
}

function eventTypes(events: SyncEvent[]): string[] {
	return events.map((event) => event.type);
}

afterEach(() => {
	vi.useRealTimers();
});

describe('require-plane stall watchdog (pump survival)', () => {
	it('abandons a stalled execution and still runs the requirement queued behind it', async () => {
		vi.useFakeTimers();
		const { plane, events } = stubPlane({
			readLane: () => new Promise(() => undefined), // the injected hang: never settles
		});

		const stalled = plane.require({
			id: 'req-stalled',
			collection: 'variations',
			kind: 'search',
			term: 'stall',
		});
		const behind = plane.require({
			id: 'req-behind',
			collection: 'variations',
			kind: 'targeted-records',
			remoteIds: [mintRemoteId(101, 'test remote id')],
		});
		const stalledSettled = stalled.ready.then(
			(outcome) => `resolved:${outcome.action}`,
			(error: Error) => error.message
		);

		await vi.advanceTimersByTimeAsync(0);
		await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS);

		await expect(stalledSettled).resolves.toMatch(/^require: stalled after \d+ms/);
		await expect(behind.ready).resolves.toMatchObject({
			action: 'serve-local',
			reason: 'every required record is resident',
		});

		const stallEvents = events.filter((event) => event.type === 'coverage.require.stalled');
		expect(stallEvents).toHaveLength(1);
		expect(stallEvents[0]?.fields).toMatchObject({
			requirementId: 'req-stalled',
			kind: 'search',
		});
		// Both executions announced themselves — the evidence pair a wedged artifact lacked.
		expect(
			events
				.filter((event) => event.type === 'coverage.require.started')
				.map((event) => event.fields?.requirementId)
		).toEqual(['req-stalled', 'req-behind']);
		expect(
			events.some(
				(event) =>
					event.type === 'coverage.gate.hit' && event.fields?.requirementId === 'req-behind'
			)
		).toBe(true);

		// A late release() on the stalled handle finds the entry already abandoned
		// (abandonStalledExecution establishes abandon()'s terminal state): inert —
		// no re-abandonment, no new diagnostics, the settled rejection stands.
		const eventCount = events.length;
		stalled.release();
		await vi.advanceTimersByTimeAsync(1_000);
		expect(events.length).toBe(eventCount);
		await expect(stalledSettled).resolves.toMatch(/^require: stalled after \d+ms/);
	});

	it('records how an abandoned execution eventually settles, without re-settling declarers', async () => {
		vi.useFakeTimers();
		let releaseLane!: (value: unknown) => void;
		const { plane, events } = stubPlane({
			readLane: () => new Promise((resolve) => (releaseLane = resolve)),
		});

		const stalled = plane.require({
			id: 'req-stalled',
			collection: 'variations',
			kind: 'search',
			term: 'stall',
		});
		const outcome = stalled.ready.then(
			() => 'resolved',
			(error: Error) => error.message
		);

		await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS);
		await expect(outcome).resolves.toMatch(/stalled/);
		expect(eventTypes(events)).not.toContain('coverage.require.stall-settled');

		// The storage promise settles late (the transient-stall case): the zombie execution
		// runs to whatever end it finds, and only the stall-settled breadcrumb records it.
		releaseLane(null);
		await vi.advanceTimersByTimeAsync(1_000);

		expect(eventTypes(events)).toContain('coverage.require.stall-settled');
		// The declarer was settled exactly once, by the stall rejection above.
		await expect(outcome).resolves.toMatch(/stalled/);
	});

	it('does not count the queue-before-ready startup wait as a stall', async () => {
		vi.useFakeTimers();
		let becomeReady!: () => void;
		const ready = new Promise<void>((resolve) => (becomeReady = resolve));
		const { plane, events } = stubPlane({
			readLane: async () => null,
			awaitReady: () => ready,
		});

		// Declared long before the engine is ready — a slow database open/migration.
		const queued = plane.require({
			id: 'req-before-ready',
			collection: 'variations',
			kind: 'targeted-records',
			remoteIds: [mintRemoteId(101, 'test remote id')],
		});
		let settled = false;
		void queued.ready.finally(() => (settled = true));

		await vi.advanceTimersByTimeAsync(300_000);
		expect(settled).toBe(false); // still queued, per the queue-before-ready contract
		expect(eventTypes(events)).not.toContain('coverage.require.stalled');
		expect(eventTypes(events)).not.toContain('coverage.require.started');

		becomeReady();
		await vi.advanceTimersByTimeAsync(0);
		await expect(queued.ready).resolves.toMatchObject({ action: 'serve-local' });
	});

	it('treats every settled demand-path request as progress, not only drain events', async () => {
		vi.useFakeTimers();
		// Each wire request takes 80s — under the 90s window on its own, over it in sum.
		// The variations search runs two sequential legs (search= then sku=), so without
		// the requirementFetcher reset the watchdog would fire mid-walk at 90s.
		const slowFetch = () =>
			new Promise<Response>((resolve) => {
				setTimeout(() => resolve(new Response('[]')), 80_000);
			});
		const { plane, events } = stubPlane({
			readLane: async () => null, // no coverage lane: the search goes to the wire
			fetcher: slowFetch,
		});

		const slow = plane.require({
			id: 'req-slow-but-moving',
			collection: 'variations',
			kind: 'search',
			term: 'slowwalk',
		});
		const settled = slow.ready.then(
			() => 'settled',
			() => 'settled'
		);

		await vi.advanceTimersByTimeAsync(80_000); // leg 1 answers → progress → clock resets
		expect(eventTypes(events)).not.toContain('coverage.require.stalled');
		await vi.advanceTimersByTimeAsync(80_000); // leg 2 answers at 160s total

		await expect(settled).resolves.toBe('settled');
		expect(eventTypes(events)).not.toContain('coverage.require.stalled');
	});

	it('still logs the stall for a released entry and keeps draining, without rejecting anyone', async () => {
		vi.useFakeTimers();
		const { plane, events } = stubPlane({
			readLane: () => new Promise(() => undefined),
		});

		const released = plane.require({
			id: 'req-released',
			collection: 'variations',
			kind: 'search',
			term: 'stall',
		});
		released.release();
		const behind = plane.require({
			id: 'req-behind',
			collection: 'variations',
			kind: 'targeted-records',
			remoteIds: [mintRemoteId(101, 'test remote id')],
		});

		await expect(released.ready).resolves.toMatchObject({ action: 'released' });
		await vi.advanceTimersByTimeAsync(STALL_TIMEOUT_MS);

		// The stall held the pump for the full window — that is ledger-worthy even though
		// nobody is waiting any more — and the queue keeps moving afterwards.
		expect(eventTypes(events)).toContain('coverage.require.stalled');
		await expect(behind.ready).resolves.toMatchObject({ action: 'serve-local' });
	});
});

describe('createRequireStallWatchdog', () => {
	// Dynamic import so the pin tests above stay runnable against pre-watchdog code.
	async function watchdogModule() {
		return (await import('./require-plane')) as unknown as {
			REQUIRE_STALL_TIMEOUT_MS: number;
			createRequireStallWatchdog: (input: { timeoutMs: number; onStall: () => void }) => {
				reset(): void;
				cancel(): void;
			};
		};
	}

	it('fires once after the timeout, and every reset defers it', async () => {
		vi.useFakeTimers();
		const { createRequireStallWatchdog } = await watchdogModule();
		let stalls = 0;
		const watchdog = createRequireStallWatchdog({ timeoutMs: 1_000, onStall: () => (stalls += 1) });
		watchdog.reset();
		await vi.advanceTimersByTimeAsync(999);
		watchdog.reset(); // progress arrived — the clock starts over
		await vi.advanceTimersByTimeAsync(999);
		expect(stalls).toBe(0);
		await vi.advanceTimersByTimeAsync(1);
		expect(stalls).toBe(1);
		// A late reset (a zombie's progress) must not re-arm a fired watchdog.
		watchdog.reset();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(stalls).toBe(1);
	});

	it('cancel disarms it for good', async () => {
		vi.useFakeTimers();
		const { createRequireStallWatchdog } = await watchdogModule();
		let stalls = 0;
		const watchdog = createRequireStallWatchdog({ timeoutMs: 1_000, onStall: () => (stalls += 1) });
		watchdog.reset();
		watchdog.cancel();
		watchdog.reset(); // after cancel, reset is inert
		await vi.advanceTimersByTimeAsync(10_000);
		expect(stalls).toBe(0);
	});

	it('sits above the longest legitimate no-progress window (the orders active-claim wait)', async () => {
		const { REQUIRE_STALL_TIMEOUT_MS } = await watchdogModule();
		const { ORDER_SCHEDULER_LEASE_FOR_MS } = await import('./scheduler');
		// The orders targeted branch waits out another owner's claim for up to twice the
		// lease with no progress events; the watchdog must never call that a stall.
		expect(REQUIRE_STALL_TIMEOUT_MS).toBeGreaterThan(ORDER_SCHEDULER_LEASE_FOR_MS * 2);
		expect(STALL_TIMEOUT_MS).toBe(REQUIRE_STALL_TIMEOUT_MS);
	});
});
