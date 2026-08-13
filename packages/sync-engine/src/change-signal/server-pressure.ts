/**
 * Server-pressure adaptation for the change-signal poll (#846, part c).
 *
 * THE RULE THIS ENFORCES: the POS must never crush the merchant's WooCommerce
 * server. Most WCPOS stores run on shared hosting, so when the server shows
 * distress the till backs its polling off automatically — whatever cadence the
 * merchant picked on the Performance screen, Realtime included. The preset is a
 * ceiling on how often we ASK, never a promise the server has to keep up with.
 *
 * This module is a pure state machine over observed HTTP outcomes. It owns no
 * clock, no timer and no transport: the engine feeds it every response it sees
 * (including demand-driven ones — a 429 raised by a cashier's product search is
 * the same server saying the same thing) and it answers with a multiplier the
 * cadence layer applies. Only the change-signal poll is slowed. Demand-driven
 * fetches are human-bounded and are never throttled — a cashier waiting on a
 * barcode lookup is not the load problem.
 *
 * SCOPING. One monitor per engine. An engine is bound to one site, so the state
 * is exactly server-scoped: a store/cashier scope switch inside the same engine
 * keeps talking to the same host and inherits the same pressure, which is
 * correct. Nothing is persisted — a fresh process starts trusting the server
 * again and re-learns within one poll if it is still unwell.
 */

/** What made us back off. Carried on the cadence log event so support can read it back. */
export type PressureSignal =
	'rate-limited' | 'server-error' | 'timeout' | 'slow' | 'server-pressure';

export type ServerPressure = 'low' | 'elevated' | 'high';

export type ServerPressureTransition = {
	direction: 'backoff' | 'recovery';
	/** 'healthy' on the recovery direction — nothing triggered it but the absence of trouble. */
	signal: PressureSignal | 'healthy';
	fromMultiplier: number;
	toMultiplier: number;
	/** Present when the server named its own pause (Retry-After); absolute epoch ms. */
	retryAfterUntilMs?: number;
	serverLoad1m?: number;
	serverLoadBaseline1m?: number;
};

export type ServerPressureObservation = {
	atMs: number;
	/** HTTP status, or 0 for a request that never settled (timeout / network failure). */
	status: number;
	durationMs: number;
	/** Raw `Retry-After` header value, when the response carried one. */
	retryAfter?: string | null;
	/** Server-reported load, absent when an older server did not send the header. */
	pressure?: ServerPressure;
	serverLoad1m?: number;
	/** The engine's connectivity verdict. An offline device's failures are not the server's fault. */
	offline?: boolean;
};

export type ServerPressureMonitor = {
	/** Feed one settled (or failed) request. Returns the transition it caused, or null. */
	observe(observation: ServerPressureObservation): ServerPressureTransition | null;
	/** True while maintenance should yield to a raised cadence or server-named pause. */
	isBackingOff(atMs: number): boolean;
	multiplier(): number;
	/** Absolute epoch-ms floor the next change-signal tick may not precede, or 0. */
	retryAfterUntilMs(): number;
	/** Raise/lower the ladder's top when the merchant's cadence changes. */
	setMaxMultiplier(maxMultiplier: number): void;
};

/**
 * Thresholds. Every number here is a judgement call about what separates "one
 * bad request" from "this server is struggling", and each is deliberately dull:
 * this is a back-off heuristic, not a control system.
 */

/**
 * 5xx and transport failures needed inside {@link PRESSURE_WINDOW_MS} before we
 * treat them as distress. THREE, because one 500 is usually a PHP fatal on a
 * single route (a bug, not load) and one timeout is usually the till's wifi;
 * three inside a minute is the server failing broadly. A 429 is exempt — that is
 * the server explicitly telling us to slow down, so a single one is enough.
 */
const PRESSURE_BURST = 3;
const PRESSURE_WINDOW_MS = 60_000;

/**
 * Sustained-slowness detector. The change-signal probes are small conditional
 * GETs; a host answering ten of them in a row with a MEDIAN above two seconds is
 * saturated, whatever its status codes say.
 *
 * Deliberately an ABSOLUTE median rather than "p95 as a multiple of a rolling
 * baseline": a baseline learned from live traffic drifts up as the server
 * degrades, so the relative test goes quiet exactly when the server is worst.
 * The median (not the mean) keeps one 30s outlier from tripping it.
 * Explicit high-pressure readings share this window, so one header can never
 * trigger back-off by itself.
 */
const SLOW_SAMPLE_COUNT = 10;
const SLOW_MEDIAN_MS = 2_000;

/**
 * Healthy responses required per halving of the multiplier. Back-off is fast
 * (one 429, or a three-strike burst) and recovery is slow (ten clean responses
 * per step, so a full climb down from ×32 takes fifty) — that asymmetry is what
 * stops the cadence flapping between fast and slow around a marginal server.
 */
const RECOVERY_HEALTHY_RESPONSES = 10;

/**
 * How long a back-off must stand before ANY recovery step is allowed.
 *
 * Response COUNT alone is not enough: the engine runs several lanes plus
 * demand-driven traffic, so ten responses can settle within a second or two of a
 * back-off — often from requests that were already in flight when the 429 landed
 * and therefore prove nothing about the server's state now. Without a dwell the
 * cadence can flap ×1 → ×2 → ×1 inside one second. Sixty seconds is one Balanced
 * poll: long enough that the healthy responses are genuinely new evidence.
 */
const RECOVERY_MIN_DWELL_MS = 60_000;

/**
 * A hostile or broken `Retry-After` must not park a point of sale for a day.
 *
 * This is a deliberate, eyes-open deviation from RFC 9110's "wait exactly this
 * long": a till that stops seeing price and stock changes for 24 hours because
 * one misconfigured proxy sent `Retry-After: 86400` is a broken POS, and the
 * cashier standing at it cannot tell the difference between that and a crash.
 * Fifteen minutes is far past any ceiling we would choose ourselves — it is real
 * meaningful relief for the server — and still short enough that a merchant
 * watching the screen sees the till come back on its own.
 */
const MAX_RETRY_AFTER_MS = 15 * 60_000;

/**
 * Parse `Retry-After` (RFC 9110): either delta-seconds or an HTTP-date. Returns
 * the delay in ms clamped to [0, {@link MAX_RETRY_AFTER_MS}], or null when the
 * header is absent or unparseable.
 */
export function parseRetryAfterMs(value: string | null | undefined, atMs: number): number | null {
	if (value === null || value === undefined) return null;
	const trimmed = value.trim();
	if (trimmed === '') return null;
	let delayMs: number;
	if (/^\d+$/.test(trimmed)) {
		delayMs = Number(trimmed) * 1_000;
	} else {
		const parsed = Date.parse(trimmed);
		if (Number.isNaN(parsed)) return null;
		delayMs = parsed - atMs;
	}
	if (!Number.isFinite(delayMs)) return null;
	return Math.min(Math.max(0, Math.round(delayMs)), MAX_RETRY_AFTER_MS);
}

export function parseServerPressure(value: string | null | undefined): ServerPressure | undefined {
	const normalized = value?.trim().toLowerCase();
	if (normalized === 'low' || normalized === 'elevated' || normalized === 'high') return normalized;
	return undefined;
}

export function parseServerLoad1m(value: string | null | undefined): number | undefined {
	try {
		const parsed: unknown = JSON.parse(value ?? '');
		if (!Array.isArray(parsed) || parsed.length !== 3) return undefined;
		const numeric = parsed.every(
			(sample) => typeof sample === 'number' && Number.isFinite(sample) && sample >= 0
		);
		return numeric && parsed.some((sample) => sample !== 0) ? parsed[0] : undefined;
	} catch {
		return undefined;
	}
}

function median(values: number[]): number {
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

export function createServerPressureMonitor(
	input: { maxMultiplier?: number } = {}
): ServerPressureMonitor {
	let maxMultiplier = Math.max(1, input.maxMultiplier ?? 1);
	let multiplier = 1;
	let retryAfterUntilMs = 0;
	let serverLoad1m: number | undefined;
	let serverLoadBaseline1m: number | undefined;
	let softLoadActive = false;
	let softLoadStreak = 0;
	let healthyStreak = 0;
	let lastBackoffAtMs = Number.NEGATIVE_INFINITY;
	/** Timestamps of 5xx / transport failures inside the rolling window. */
	let distressAtMs: number[] = [];
	let latencySamples: { durationMs: number; pressure?: ServerPressure }[] = [];
	const effectiveMultiplier = (): number =>
		Math.max(multiplier, softLoadActive ? Math.min(2, maxMultiplier) : 1);
	const observeServerLoad = (load1m: number): ServerPressureTransition | null => {
		serverLoad1m = load1m;
		if (serverLoadBaseline1m === undefined) {
			if (load1m > 0) serverLoadBaseline1m = load1m;
			return null;
		}
		const baseline = serverLoadBaseline1m;
		const crossesBoundary = softLoadActive
			? load1m < 1.25 * baseline
			: load1m >= Math.max(2 * baseline, 1);
		softLoadStreak = crossesBoundary ? softLoadStreak + 1 : 0;
		serverLoadBaseline1m = baseline + 0.05 * (load1m - baseline);
		if (softLoadStreak < 2) return null;
		softLoadStreak = 0;
		const from = effectiveMultiplier();
		softLoadActive = !softLoadActive;
		const to = effectiveMultiplier();
		if (to === from) return null;
		return {
			direction: softLoadActive ? 'backoff' : 'recovery',
			signal: softLoadActive ? 'server-pressure' : 'healthy',
			fromMultiplier: from,
			toMultiplier: to,
			serverLoad1m,
			serverLoadBaseline1m,
		};
	};

	const stepUp = (signal: PressureSignal, atMs: number): ServerPressureTransition | null => {
		healthyStreak = 0;
		lastBackoffAtMs = atMs;
		const from = effectiveMultiplier();
		const to = Math.min(multiplier * 2, maxMultiplier);
		multiplier = to;
		if (effectiveMultiplier() === from) return null;
		return {
			direction: 'backoff',
			signal,
			fromMultiplier: from,
			toMultiplier: effectiveMultiplier(),
			...(retryAfterUntilMs > atMs ? { retryAfterUntilMs } : {}),
		};
	};

	/**
	 * The server named a pause but the ladder did not move (already at the top, or
	 * a 5xx that has not yet made a burst). The cadence layer still has to hear
	 * about it — otherwise an ALREADY-ARMED timer fires inside the pause and we
	 * violate the one instruction the server gave us explicitly.
	 */
	const pauseOnly = (signal: PressureSignal): ServerPressureTransition => ({
		direction: 'backoff',
		signal,
		fromMultiplier: effectiveMultiplier(),
		toMultiplier: effectiveMultiplier(),
		retryAfterUntilMs,
	});

	return {
		isBackingOff: (atMs) => multiplier > 1 || retryAfterUntilMs > atMs,
		multiplier: effectiveMultiplier,
		retryAfterUntilMs: () => retryAfterUntilMs,

		setMaxMultiplier(next) {
			maxMultiplier = Math.max(1, next);
			// A slower tier has a shorter ladder; never leave the multiplier above its top.
			if (multiplier > maxMultiplier) multiplier = maxMultiplier;
		},

		observe(observation) {
			const { atMs, status, durationMs } = observation;
			// A device with no network produces the same status-0 failures a dying
			// server does. Blaming the merchant's host for the till's wifi would back
			// off exactly when reconnecting wants a prompt poll, so offline failures
			// are not evidence of anything and are dropped whole.
			if (observation.offline === true && status === 0) return null;

			const retryAfterMs = parseRetryAfterMs(observation.retryAfter, atMs);
			// A server that names its own pause gets it honoured verbatim, on any
			// status that carries one (429 and 503 both do in practice). The floor only
			// ever moves forward — a later, shorter Retry-After cannot pull the till
			// back in early.
			let retryAfterAdvanced = false;
			if (retryAfterMs !== null && status !== 0 && (status < 200 || status >= 400)) {
				const until = atMs + retryAfterMs;
				if (until > retryAfterUntilMs) {
					retryAfterUntilMs = until;
					retryAfterAdvanced = true;
				}
			}

			if (status === 429) {
				const stepped = stepUp('rate-limited', atMs);
				if (stepped !== null) return stepped;
				// Already at the ladder's top: still worth a transition when the server
				// extended its own pause, and silence when nothing actually changed.
				return retryAfterAdvanced ? pauseOnly('rate-limited') : null;
			}

			if (status === 0 || status >= 500) {
				healthyStreak = 0;
				distressAtMs = distressAtMs.filter((at) => atMs - at < PRESSURE_WINDOW_MS);
				distressAtMs.push(atMs);
				if (distressAtMs.length < PRESSURE_BURST) {
					// Below the burst threshold the ladder does not move — but a 503 that
					// carried Retry-After has still bought the server a pause, and the
					// cadence layer has to re-arm for it or the already-armed tick fires
					// straight through the window the server asked for.
					return retryAfterAdvanced ? pauseOnly('server-error') : null;
				}
				// The burst has been spent — start a fresh window so the NEXT step needs
				// another three failures rather than riding the same ones up the ladder.
				distressAtMs = [];
				const stepped = stepUp(status === 0 ? 'timeout' : 'server-error', atMs);
				if (stepped !== null) return stepped;
				return retryAfterAdvanced ? pauseOnly('server-error') : null;
			}

			// 4xx that is not 429 (401/403/404/409…) says something about the request,
			// not the server's load. It is neither distress nor a clean bill of health.
			const accepted = status >= 200 && status < 400;
			if (!accepted) return null;

			latencySamples.push({ durationMs, pressure: observation.pressure });
			if (latencySamples.length > SLOW_SAMPLE_COUNT) latencySamples.shift();
			const effectiveLatency = latencySamples.map((sample) =>
				sample.pressure === 'high'
					? Math.max(sample.durationMs, SLOW_MEDIAN_MS + 1)
					: sample.durationMs
			);
			if (
				latencySamples.length === SLOW_SAMPLE_COUNT &&
				median(effectiveLatency) > SLOW_MEDIAN_MS
			) {
				const signal =
					median(latencySamples.map((sample) => sample.durationMs)) > SLOW_MEDIAN_MS
						? 'slow'
						: 'server-pressure';
				// Drop the window with the step: without this the same ten slow samples
				// would trip every subsequent request and walk straight to the ceiling.
				latencySamples = [];
				return stepUp(signal, atMs);
			}

			// Reported pressure is neither distress nor evidence that a prior back-off can be undone.
			if (observation.pressure === 'elevated' || observation.pressure === 'high') return null;
			const softTransition =
				multiplier === 1 && retryAfterUntilMs <= atMs && observation.serverLoad1m !== undefined
					? observeServerLoad(observation.serverLoad1m)
					: null;
			healthyStreak += 1;
			if (multiplier === 1 || healthyStreak < RECOVERY_HEALTHY_RESPONSES) return softTransition;
			// Two brakes on recovery, both anti-flap:
			//  - the dwell, so ten responses that were already in flight when we backed
			//    off cannot immediately undo it;
			//  - the server's own pause, because claiming to have recovered while still
			//    inside a Retry-After window would write a false "back to normal" row
			//    into the durable log (#899: the log must not lie about outcomes).
			if (atMs - lastBackoffAtMs < RECOVERY_MIN_DWELL_MS) return null;
			if (retryAfterUntilMs > atMs) return null;
			healthyStreak = 0;
			// A server this healthy makes any surviving strike stale evidence. Without
			// this, one old 5xx left in the window could complete a burst right after a
			// recovery and bounce the cadence straight back up.
			distressAtMs = [];
			const from = effectiveMultiplier();
			multiplier = Math.max(1, Math.floor(multiplier / 2));
			if (effectiveMultiplier() === from) return null;
			return {
				direction: 'recovery',
				signal: 'healthy',
				fromMultiplier: from,
				toMultiplier: effectiveMultiplier(),
			};
		},
	};
}
