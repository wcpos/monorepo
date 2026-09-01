/**
 * Server-pressure adaptation, through the PUBLIC handle (#846 part c/d).
 *
 * The contract under test is Paul's rule: the POS must never crush the
 * merchant's WooCommerce server. Whatever cadence the merchant chose, a server
 * in distress slows the change-signal poll down, an impatient cashier cannot
 * override that, and every transition lands in the durable log so support can
 * reconstruct it later.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import type { SyncEvent, SyncEventType } from '@wcpos/sync-core';

import { createRxdbSyncEngine, type RxdbSyncEnginePorts } from './create-rxdb-sync-engine';
import { memoryEngineStorage, scriptedConnectivity } from './testing';

setPremiumFlag();

const SITE = 'https://pressure.example.test';
const SYNC_BASE = `${SITE}/wp-json/wcpos/v2`;
let uniqueStore = 0;

type CapturedTimeout = {
	callback: () => void;
	delay: number;
	handle: ReturnType<typeof setTimeout>;
};

/**
 * Timer capture is process-wide, so a test that builds TWO engines must not
 * re-spy — the second spy would capture the first as its "real" implementation
 * and recurse forever. One installation per test, reset in afterEach.
 */
let installedTimers: { intervals: { delay: number }[]; timeouts: CapturedTimeout[] } | null = null;

function captureTimers(): {
	intervals: { delay: number }[];
	timeouts: CapturedTimeout[];
} {
	if (installedTimers !== null) return installedTimers;
	const intervals: { delay: number }[] = [];
	const timeouts: CapturedTimeout[] = [];
	let nextHandle = 1;
	vi.spyOn(globalThis, 'setInterval').mockImplementation(((
		_callback: () => void,
		delay: number
	) => {
		const handle = nextHandle++ as unknown as ReturnType<typeof setInterval>;
		intervals.push({ delay });
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
	vi.spyOn(globalThis, 'clearTimeout').mockImplementation((handle) => realClearTimeout(handle));
	installedTimers = { intervals, timeouts };
	return installedTimers;
}

/** The delay of the change-signal timer currently armed, read off public status. */
function armedDelay(
	engine: { status: () => { lanes: Record<string, { nextDueAtMs?: number }> } },
	nowMs: number
): number {
	return engine.status().lanes['change-signal']!.nextDueAtMs! - nowMs;
}

/** An empty-but-valid JSON envelope; enough for every lane the engine arms. */
function emptyEnvelope(): Response {
	return new Response(JSON.stringify({ changes: [], complete: true, documents: [] }), {
		status: 200,
		headers: { 'content-type': 'application/json' },
	});
}

type Harness = {
	engine: ReturnType<typeof createRxdbSyncEngine>;
	timers: ReturnType<typeof captureTimers>;
	diagnostics: SyncEvent[];
	/**
	 * Push one scripted response (or thrown failure) through the engine's
	 * transport. `elapsedMs` advances the clock WHILE the request is in flight, so
	 * the wrapper sees a genuinely long-running request.
	 */
	respond: (
		response: Response | Error,
		options?: { elapsedMs?: number; signal?: AbortSignal }
	) => Promise<void>;
	setNow: (ms: number) => void;
	now: () => number;
};

/** Build a deterministic engine harness with scripted transport responses. */
async function harness(
	overrides: Partial<RxdbSyncEnginePorts> = {},
	options: { startAtMs?: number } = {}
): Promise<Harness> {
	uniqueStore += 1;
	let nowMs = options.startAtMs ?? 1_000;
	let scripted: Response | Error | null = null;
	let scriptedElapsedMs = 0;
	const diagnostics: SyncEvent[] = [];
	const timers = captureTimers();
	const engine = createRxdbSyncEngine(
		{
			site: { syncBaseUrl: SYNC_BASE, wpJsonRoot: `${SITE}/wp-json` },
			storage: memoryEngineStorage(),
			mode: 'auto',
			now: () => nowMs,
			random: () => 0.5,
			diagnostics: (event) => diagnostics.push(event),
			fetcher: async () => {
				const next = scripted;
				scripted = null;
				// Time passes inside the request, exactly as it would on the wire.
				nowMs += scriptedElapsedMs;
				scriptedElapsedMs = 0;
				if (next instanceof Error) throw next;
				return next ?? emptyEnvelope();
			},
			...overrides,
		},
		{ site: SITE, storeId: 1, cashierId: `pressure-${uniqueStore}` }
	);
	await engine.ready;
	await vi.waitFor(() => expect(timers.intervals.length).toBeGreaterThanOrEqual(9));
	await vi.waitFor(() => expect(engine.status().lanes['change-signal'].nextDueAtMs).toBeDefined());

	const respond = async (
		response: Response | Error,
		responseOptions?: { elapsedMs?: number; signal?: AbortSignal }
	): Promise<void> => {
		scripted = response;
		scriptedElapsedMs = responseOptions?.elapsedMs ?? 0;
		// hostTransport exposes the SAME wrapped fetcher the engine's lanes use, so
		// driving it here exercises the real pressure seam rather than a stand-in.
		await engine
			.hostTransport()
			.fetcher(
				`${SYNC_BASE}/changes/tick`,
				responseOptions?.signal === undefined ? undefined : { signal: responseOptions.signal }
			)
			.catch(() => undefined);
	};

	return {
		engine,
		timers,
		diagnostics,
		respond,
		setNow: (ms) => {
			nowMs = ms;
		},
		now: () => nowMs,
	};
}

/** Filter AND narrow: the predicate keeps the discriminant, so `fields` reads
 *  get the shape declared for `type` instead of the whole union. */
const cadenceEvents = <T extends SyncEventType>(
	events: SyncEvent[],
	type: T
): Extract<SyncEvent, { type: T }>[] =>
	events.filter((event): event is Extract<SyncEvent, { type: T }> => event.type === type);

afterEach(() => {
	installedTimers = null;
	vi.restoreAllMocks();
});

describe('change-signal server-pressure adaptation', () => {
	it('defers audit/trickle/query-total maintenance but not change-signal or write-drain', async () => {
		const context = await harness({
			queryTotal: { fetchWooQueryTotal: vi.fn(async () => 0) },
		});
		await context.respond(new Response(null, { status: 429 }));

		for (const lane of [
			'customer-trickle',
			'product-trickle',
			'existence-prime',
			'existence-reconcile',
			'query-total-retry',
		] as const) {
			await expect(context.engine.sync(lane)).resolves.toMatchObject({
				lane,
				status: 'skipped',
				reason: 'server-pressure',
			});
		}
		expect((await context.engine.sync('change-signal')).reason).not.toBe('server-pressure');
		expect((await context.engine.sync('write-drain')).reason).not.toBe('server-pressure');
		await context.engine.dispose();
	});

	it('bounds the pressure stand-down with the starvation ceiling: one reduced tick per window (mono#1159)', async () => {
		const context = await harness({
			queryTotal: { fetchWooQueryTotal: vi.fn(async () => 0) },
		});
		await context.respond(new Response(null, { status: 429 }));

		// (a) Pressure armed, ceiling not reached: the audit stands down exactly as before.
		await expect(context.engine.sync('existence-reconcile')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'server-pressure',
		});
		// (d) A session that STARTS under pressure measures its ceiling from the first
		// observed tick — an immediate retry is still a stand-down, never a run.
		await expect(context.engine.sync('existence-reconcile')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'server-pressure',
		});

		// (b) Past 2x the lane's default interval with pressure STILL armed (no healthy
		// responses arrived), the lane runs one starvation tick instead of skipping.
		context.setNow(context.now() + 2 * 17 * 60_000 + 1);
		context.diagnostics.length = 0;
		await expect(context.engine.sync('existence-reconcile')).resolves.toMatchObject({
			lane: 'existence-reconcile',
			status: 'ran',
		});
		expect(context.diagnostics).toContainEqual(
			expect.objectContaining({
				type: 'maintenance.lane.tick',
				fields: expect.objectContaining({ lane: 'existence-reconcile', starvation: true }),
			})
		);

		// (c) The starvation run re-arms the ceiling: the very next pressured tick
		// stands down again — never more than one reduced tick per window.
		await expect(context.engine.sync('existence-reconcile')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'server-pressure',
		});

		await context.engine.dispose();
	});

	it('keeps normal (pressure-free) ticks unflagged and full-budget after a starvation run', async () => {
		const context = await harness();
		// Never pressured: the lane runs normally and its tick never carries the flag.
		await expect(context.engine.sync('existence-reconcile')).resolves.toMatchObject({
			lane: 'existence-reconcile',
			status: 'ran',
		});
		expect(
			cadenceEvents(context.diagnostics, 'maintenance.lane.tick').some(
				(event) => (event.fields as { starvation?: boolean }).starvation === true
			)
		).toBe(false);
		await context.engine.dispose();
	});

	it('honours Retry-After exactly and records the back-off', async () => {
		const context = await harness();
		context.diagnostics.length = 0;

		await context.respond(
			new Response(JSON.stringify({ code: 'too_many_requests' }), {
				status: 429,
				headers: { 'content-type': 'application/json', 'retry-after': '120' },
			})
		);

		// The pending tick was re-armed the moment the server pushed back — the next
		// one cannot land before the 120s the server named.
		expect(armedDelay(context.engine, context.now())).toBeGreaterThanOrEqual(120_000);

		const [backoff] = cadenceEvents(context.diagnostics, 'cadence.backoff');
		expect(backoff).toBeDefined();
		expect(backoff!.level).toBe('info');
		expect(backoff!.fields).toMatchObject({
			signal: 'rate-limited',
			fromIntervalMs: 10_000,
			toIntervalMs: 20_000,
			pressureMultiplier: 2,
			retryAfterMs: 120_000,
		});
		await context.engine.dispose();
	});

	it('multiplies the interval on a timeout burst and stops at the ceiling', async () => {
		const context = await harness();
		context.diagnostics.length = 0;

		const timeout = (): Error => Object.assign(new Error('timeout'), { name: 'TimeoutError' });
		// Three failures inside the rolling window = one step; fifteen walks a 10s
		// tier all the way up: 10 → 20 → 40 → 80 → 160 → 300 (the ceiling).
		for (let index = 0; index < 15; index += 1) {
			context.setNow(context.now() + 1_000);
			await context.respond(timeout());
		}

		const backoffs = cadenceEvents(context.diagnostics, 'cadence.backoff');
		expect(backoffs.map((event) => event.fields?.toIntervalMs)).toEqual([
			20_000, 40_000, 80_000, 160_000, 300_000,
		]);
		expect(backoffs[0]!.fields).toMatchObject({ signal: 'timeout' });
		expect(armedDelay(context.engine, context.now())).toBe(300_000);

		// The ceiling holds: fifteen more failures buy the server no further silence.
		for (let index = 0; index < 15; index += 1) {
			context.setNow(context.now() + 1_000);
			await context.respond(timeout());
		}
		expect(cadenceEvents(context.diagnostics, 'cadence.backoff')).toHaveLength(5);
		await context.engine.dispose();
	});

	it('ingests pressure headers case-insensitively and ignores unknown values', async () => {
		const ignored = await harness();
		ignored.diagnostics.length = 0;
		for (let index = 0; index < 10; index += 1) {
			await ignored.respond(
				new Response(null, { status: 200, headers: { 'X-WCPOS-Pressure': 'overloaded' } })
			);
		}
		expect(cadenceEvents(ignored.diagnostics, 'cadence.backoff')).toHaveLength(0);
		await ignored.engine.dispose();

		const pressured = await harness();
		pressured.diagnostics.length = 0;
		for (let index = 0; index < 10; index += 1) {
			await pressured.respond(
				new Response(null, { status: 200, headers: { 'x-wcpos-pressure': 'HIGH' } })
			);
		}
		const [backoff] = cadenceEvents(pressured.diagnostics, 'cadence.backoff');
		expect(backoff!.fields).toMatchObject({
			signal: 'server-pressure',
			pressureMultiplier: 2,
		});
		await pressured.engine.dispose();
	});

	it('widens cadence from valid server-load headers and reports the learned baseline', async () => {
		const context = await harness();
		context.diagnostics.length = 0;

		for (const value of [undefined, 'not-json', '[0,0,0]']) {
			await context.respond(
				new Response(null, {
					status: 200,
					...(value === undefined ? {} : { headers: { 'X-Server-Load': value } }),
				})
			);
		}
		expect(cadenceEvents(context.diagnostics, 'cadence.backoff')).toHaveLength(0);

		for (const value of ['[0.4,0.3,0.2]', '[1,0.8,0.6]', '[1,0.8,0.6]']) {
			await context.respond(
				new Response(null, { status: 200, headers: { 'X-Server-Load': value } })
			);
		}

		const [backoff] = cadenceEvents(context.diagnostics, 'cadence.backoff');
		expect(backoff!.fields).toMatchObject({
			signal: 'server-pressure',
			pressureMultiplier: 2,
			serverLoad1m: 1,
			serverLoadBaseline1m: expect.any(Number),
		});
		await context.engine.dispose();
	});

	it('does not read the device being offline as the server being in trouble', async () => {
		const connectivity = scriptedConnectivity('offline');
		const context = await harness({ connectivity: connectivity.signal });
		context.diagnostics.length = 0;

		for (let index = 0; index < 10; index += 1) {
			context.setNow(context.now() + 1_000);
			await context.respond(new Error('network down'));
		}

		expect(cadenceEvents(context.diagnostics, 'cadence.backoff')).toHaveLength(0);
		await context.engine.dispose();
	});

	it('decays the multiplier gradually on recovery, one step at a time', async () => {
		const context = await harness();
		await context.respond(new Response(null, { status: 429 }));
		await context.respond(new Response(null, { status: 429 }));
		expect(cadenceEvents(context.diagnostics, 'cadence.backoff')).toHaveLength(2);
		context.diagnostics.length = 0;

		// Nine clean responses are not yet a recovery — the streak has to be earned.
		for (let index = 0; index < 9; index += 1) await context.respond(emptyEnvelope());
		expect(cadenceEvents(context.diagnostics, 'cadence.recovered')).toHaveLength(0);

		// Even the tenth changes nothing while the dwell is running: these all landed
		// within a second of the back-off, so they were in flight when it happened.
		await context.respond(emptyEnvelope());
		expect(cadenceEvents(context.diagnostics, 'cadence.recovered')).toHaveLength(0);

		// Once the back-off has stood for a full minute, the earned streak counts.
		context.setNow(context.now() + 60_000);
		await context.respond(emptyEnvelope());
		const [first] = cadenceEvents(context.diagnostics, 'cadence.recovered');
		expect(first!.level).toBe('info');
		expect(first!.fields).toMatchObject({
			signal: 'healthy',
			fromIntervalMs: 40_000,
			toIntervalMs: 20_000,
			pressureMultiplier: 2,
		});
		// Still not back to the merchant's cadence — no single jump to normal.
		expect(first!.fields).not.toHaveProperty('outcome');

		for (let index = 0; index < 10; index += 1) await context.respond(emptyEnvelope());
		const recoveries = cadenceEvents(context.diagnostics, 'cadence.recovered');
		expect(recoveries).toHaveLength(2);
		expect(recoveries[1]!.fields).toMatchObject({
			toIntervalMs: 10_000,
			pressureMultiplier: 1,
			outcome: 'recovered',
		});
		await context.engine.dispose();
	});

	it('lets foreground activity cancel idle decay but never server pressure', async () => {
		let activityListener: (() => void) | null = null;
		let lastActivityMs = 1;
		const idleStartMs = 10 * 60_000 + 1;
		const context = await harness(
			{
				lastUserActivityMs: () => lastActivityMs,
				onUserActivity: (listener) => {
					activityListener = listener;
					return () => undefined;
				},
			},
			{ startAtMs: idleStartMs }
		);

		// Baseline: pure idle decay DOES snap back for a cashier who walks up.
		expect(armedDelay(context.engine, context.now())).toBe(30_000);
		lastActivityMs = context.now();
		activityListener!();
		expect(armedDelay(context.engine, context.now())).toBe(10_000);

		// Now the server pushes back, and the till goes idle again.
		await context.respond(new Response(null, { status: 429 }));
		lastActivityMs = 1;
		context.setNow(context.now() + 20 * 60_000);
		// Force the decay level forward the way a fired tick would.
		const pending = context.timers.timeouts.at(-1)!;
		clearTimeout(pending.handle);
		pending.callback();
		const decayedUnderPressure = armedDelay(context.engine, context.now());
		expect(decayedUnderPressure).toBe(60_000);

		// The impatient cashier: activity clears idle decay, but the pressured
		// cadence stands and there is NO opportunistic catch-up tick.
		const ticksBefore = context.diagnostics.filter(
			(event) => event.type === 'engine.lane.tick' && event.fields?.lane === 'change-signal'
		).length;
		lastActivityMs = context.now();
		activityListener!();
		expect(armedDelay(context.engine, context.now())).toBe(20_000);
		expect(armedDelay(context.engine, context.now())).toBeGreaterThan(10_000);
		await Promise.resolve();
		await Promise.resolve();
		expect(
			context.diagnostics.filter(
				(event) => event.type === 'engine.lane.tick' && event.fields?.lane === 'change-signal'
			)
		).toHaveLength(ticksBefore);
		await context.engine.dispose();
	});

	it('never lets an armed tick fire through a pause the server asked for', async () => {
		const context = await harness();
		context.diagnostics.length = 0;

		// ONE 503 — below the three-strike burst, so the ladder does not move. The
		// armed 10s tick must still be pushed out behind the 60s the server named.
		await context.respond(new Response(null, { status: 503, headers: { 'retry-after': '60' } }));

		expect(armedDelay(context.engine, context.now())).toBeGreaterThanOrEqual(60_000);
		const [backoff] = cadenceEvents(context.diagnostics, 'cadence.backoff');
		expect(backoff!.fields).toMatchObject({
			signal: 'server-error',
			pressureMultiplier: 1,
			retryAfterMs: 60_000,
		});
		await context.engine.dispose();
	});

	it('honours a Retry-After mirrored into the error body when the header is stripped (B10)', async () => {
		// Hostile hosts strip Access-Control-Expose-Headers, so the header can be
		// unreadable while the plugin's body mirror (data.retry_after_seconds,
		// free#1649) still names the pause.
		const context = await harness();
		context.diagnostics.length = 0;

		await context.respond(
			new Response(JSON.stringify({ code: 'x', data: { retry_after_seconds: 60 } }), {
				status: 503,
				headers: { 'content-type': 'application/json' },
			})
		);

		expect(armedDelay(context.engine, context.now())).toBeGreaterThanOrEqual(60_000);
		const [backoff] = cadenceEvents(context.diagnostics, 'cadence.backoff');
		expect(backoff!.fields).toMatchObject({ retryAfterMs: 60_000 });
		await context.engine.dispose();
	});

	it('honours the body mirror when Retry-After is present but invalid', async () => {
		const context = await harness();
		context.diagnostics.length = 0;

		await context.respond(
			new Response(JSON.stringify({ code: 'x', data: { retry_after_seconds: 60 } }), {
				status: 503,
				headers: { 'content-type': 'application/json', 'retry-after': '0.5' },
			})
		);

		expect(armedDelay(context.engine, context.now())).toBeGreaterThanOrEqual(60_000);
		const [backoff] = cadenceEvents(context.diagnostics, 'cadence.backoff');
		expect(backoff!.fields).toMatchObject({ retryAfterMs: 60_000 });
		await context.engine.dispose();
	});

	it('prefers a readable, valid Retry-After header over a divergent body value', async () => {
		const context = await harness();
		context.diagnostics.length = 0;

		await context.respond(
			new Response(JSON.stringify({ code: 'x', data: { retry_after_seconds: 600 } }), {
				status: 503,
				headers: { 'content-type': 'application/json', 'retry-after': '60' },
			})
		);

		const [backoff] = cadenceEvents(context.diagnostics, 'cadence.backoff');
		expect(backoff!.fields).toMatchObject({ retryAfterMs: 60_000 });
		await context.engine.dispose();
	});

	it('ignores a malformed body retry_after_seconds', async () => {
		const context = await harness();
		context.diagnostics.length = 0;

		// One 503 is below the three-strike burst, so with no VALID pause named
		// anywhere there must be no back-off at all.
		await context.respond(
			new Response(JSON.stringify({ code: 'x', data: { retry_after_seconds: -5 } }), {
				status: 503,
				headers: { 'content-type': 'application/json' },
			})
		);

		expect(cadenceEvents(context.diagnostics, 'cadence.backoff')).toHaveLength(0);
		await context.engine.dispose();
	});

	it('never re-arms a back-off to an earlier deadline than the one already set', async () => {
		// A high jitter draw arms the first tick long; the redraw on a pause-only
		// transition must not be allowed to pull it closer.
		let draw = 1;
		const context = await harness({ random: () => draw });

		// Climb to a pressured cadence well beyond any short Retry-After.
		for (let index = 0; index < 9; index += 1) {
			context.setNow(context.now() + 1_000);
			await context.respond(new Error('boom'));
		}
		const armedBefore = context.engine.status().lanes['change-signal']!.nextDueAtMs!;
		expect(armedBefore - context.now()).toBe(96_000);

		// Now a 503 naming a 5s pause, with the lowest possible jitter draw. The
		// steady interval has not changed, so an unguarded redraw would land at
		// 0.8 × 80s = 64s — earlier than the 96s already armed, while the server was
		// asking for MORE distance, not less.
		draw = 0;
		await context.respond(new Response(null, { status: 503, headers: { 'retry-after': '5' } }));

		expect(context.engine.status().lanes['change-signal']!.nextDueAtMs).toBe(armedBefore);
		await context.engine.dispose();
	});

	it('stays silent about cadence in manual mode, where no timer is ever armed', async () => {
		uniqueStore += 1;
		const diagnostics: SyncEvent[] = [];
		const engine = createRxdbSyncEngine(
			{
				site: { syncBaseUrl: SYNC_BASE, wpJsonRoot: `${SITE}/wp-json` },
				storage: memoryEngineStorage(),
				mode: 'manual',
				diagnostics: (event) => diagnostics.push(event),
				fetcher: async () => new Response(null, { status: 429 }),
			},
			{ site: SITE, storeId: 1, cashierId: `pressure-manual-${uniqueStore}` }
		);
		await engine.ready;

		for (let index = 0; index < 5; index += 1) {
			await engine
				.hostTransport()
				.fetcher(`${SYNC_BASE}/changes/tick`)
				.catch(() => undefined);
		}

		expect(cadenceEvents(diagnostics, 'cadence.backoff')).toHaveLength(0);
		expect(cadenceEvents(diagnostics, 'cadence.start')).toHaveLength(0);
		await engine.dispose();
	});

	it('reads a request abandoned past the lookup deadline as a real timeout', async () => {
		const context = await harness();
		context.diagnostics.length = 0;

		// Three requests each abandoned after 10s. Whoever pulled the plug, the
		// server had not answered in that time — that is the timeout signal.
		const deadlineAbort = (): Error =>
			Object.assign(new Error('barcode online lookup timed out'), { name: 'AbortError' });
		for (let index = 0; index < 3; index += 1) {
			await context.respond(deadlineAbort(), { elapsedMs: 10_000 });
		}

		const [backoff] = cadenceEvents(context.diagnostics, 'cadence.backoff');
		expect(backoff!.fields).toMatchObject({ signal: 'timeout', toIntervalMs: 20_000 });
		await context.engine.dispose();
	});

	it('does not invent pressure from requests the engine itself aborted', async () => {
		const context = await harness();
		context.diagnostics.length = 0;

		// A scope switch or disposal cancels several in-flight requests at once —
		// exactly the shape of a three-strike burst, but none of it is the server.
		const abort = (): Error => Object.assign(new Error('aborted'), { name: 'AbortError' });
		for (let index = 0; index < 10; index += 1) {
			context.setNow(context.now() + 1_000);
			await context.respond(abort());
		}

		expect(cadenceEvents(context.diagnostics, 'cadence.backoff')).toHaveLength(0);
		expect(armedDelay(context.engine, context.now() - 10_000)).toBe(10_000);
		await context.engine.dispose();
	});

	it('does not invent pressure from a native-shaped cancellation, where the name is never AbortError (#1672)', async () => {
		const context = await harness();
		context.diagnostics.length = 0;

		// Expo's native fetch rejects an aborted request with a plain Error
		// wrapping FetchRequestCanceledException — the aborted signal is the only
		// trustworthy evidence that the cancellation was ours.
		const controller = new AbortController();
		controller.abort();
		/** Reproduce Expo's native cancellation error without an AbortError name. */
		const nativeCancel = (): Error =>
			new Error('fetch failed: FetchRequestCanceledException: Fetch request has been canceled');
		for (let index = 0; index < 10; index += 1) {
			context.setNow(context.now() + 1_000);
			await context.respond(nativeCancel(), { signal: controller.signal });
		}

		expect(cadenceEvents(context.diagnostics, 'cadence.backoff')).toHaveLength(0);
		expect(armedDelay(context.engine, context.now() - 10_000)).toBe(10_000);
		await context.engine.dispose();
	});

	it('records the cadence at startup and on every preset change', async () => {
		const context = await harness();

		const [start] = cadenceEvents(context.diagnostics, 'cadence.start');
		expect(start!.level).toBe('info');
		expect(start!.fields).toMatchObject({ intervalMs: 10_000, tierMs: 10_000 });

		context.engine.reconfigure({ changeSignalPollMs: 60_000, pullBatchSize: 50 });
		const [reconfigured] = cadenceEvents(context.diagnostics, 'cadence.reconfigured');
		expect(reconfigured!.level).toBe('info');
		expect(reconfigured!.fields).toMatchObject({
			tierMs: 60_000,
			fromIntervalMs: 10_000,
			toIntervalMs: 60_000,
			pullBatchSize: 50,
		});

		// Steady-state ticking adds nothing: one start row, one change row, no spam.
		const pending = context.timers.timeouts.at(-1)!;
		clearTimeout(pending.handle);
		pending.callback();
		expect(cadenceEvents(context.diagnostics, 'cadence.start')).toHaveLength(1);
		expect(cadenceEvents(context.diagnostics, 'cadence.reconfigured')).toHaveLength(1);
		await context.engine.dispose();
	});

	it('carries an active back-off through a preset change and retunes its ceiling', async () => {
		const context = await harness();
		await context.respond(new Response(null, { status: 429 }));
		expect(armedDelay(context.engine, context.now())).toBe(20_000);

		// Choosing Realtime does not buy a cashier their way out of a sick server.
		context.engine.reconfigure({ changeSignalPollMs: 5_000 });
		expect(armedDelay(context.engine, context.now())).toBe(10_000);
		const [reconfigured] = cadenceEvents(context.diagnostics, 'cadence.reconfigured');
		expect(reconfigured!.fields).toMatchObject({ pressureMultiplier: 2 });
		await context.engine.dispose();
	});

	it('a forced census bypasses the pressure stand-down; unforced ticks still defer', async () => {
		const fetchWooQueryTotal = vi.fn(async () => 40);
		const context = await harness({ queryTotal: { fetchWooQueryTotal } });
		// Warm the census so every entry is FRESH — the state the live soak
		// (2026-08-19) caught: fresh totals + pressure ate the manual refresh.
		await expect(context.engine.sync('query-total-retry')).resolves.toMatchObject({
			status: 'ran',
		});
		expect(fetchWooQueryTotal.mock.calls.length).toBeGreaterThanOrEqual(9);
		fetchWooQueryTotal.mockClear();

		await context.respond(new Response(null, { status: 429 }));

		// Unforced tick: pressure deferral holds.
		await expect(context.engine.sync('query-total-retry')).resolves.toMatchObject({
			status: 'skipped',
			reason: 'server-pressure',
		});
		expect(fetchWooQueryTotal).not.toHaveBeenCalled();

		// The cashier's explicit "Check everything now" (full manual sync) must
		// still refresh every total — the rest of the sweep is not pressure-gated,
		// so deferring only the census silently breaks the button's promise.
		await expect(context.engine.sync()).resolves.toMatchObject({ status: 'ran' });
		expect(fetchWooQueryTotal.mock.calls.length).toBeGreaterThanOrEqual(9);

		// The per-row forced check bypasses the same way.
		fetchWooQueryTotal.mockClear();
		await context.respond(new Response(null, { status: 429 }));
		await expect(context.engine.checkCollection('products')).resolves.toMatchObject({
			collection: 'products',
		});
		expect(fetchWooQueryTotal.mock.calls.length).toBeGreaterThanOrEqual(1);
		await context.engine.dispose();
	});

	it('starts every engine trusting the server again', async () => {
		const first = await harness();
		await first.respond(new Response(null, { status: 429 }));
		expect(armedDelay(first.engine, first.now())).toBe(20_000);
		await first.engine.dispose();

		const second = await harness();
		expect(armedDelay(second.engine, second.now())).toBe(10_000);
		expect(cadenceEvents(second.diagnostics, 'cadence.backoff')).toHaveLength(0);
		await second.engine.dispose();
	});
});
