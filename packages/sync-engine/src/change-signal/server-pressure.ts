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
export type PressureSignal = 'rate-limited' | 'server-error' | 'timeout' | 'slow';

export type ServerPressureTransition = {
	direction: 'backoff' | 'recovery';
	/** 'healthy' on the recovery direction — nothing triggered it but the absence of trouble. */
	signal: PressureSignal | 'healthy';
	fromMultiplier: number;
	toMultiplier: number;
	/** Present when the server named its own pause (Retry-After); absolute epoch ms. */
	retryAfterUntilMs?: number;
};

export type ServerPressureObservation = {
	atMs: number;
	/** HTTP status, or 0 for a request that never settled (timeout / network failure). */
	status: number;
	durationMs: number;
	/** Raw `Retry-After` header value, when the response carried one. */
	retryAfter?: string | null;
	/** The engine's connectivity verdict. An offline device's failures are not the server's fault. */
	offline?: boolean;
};

export type ServerPressureMonitor = {
	/** Feed one settled (or failed) request. Returns the transition it caused, or null. */
	observe(observation: ServerPressureObservation): ServerPressureTransition | null;
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
 * A hostile or broken `Retry-After` must not park the till for a day. Fifteen
 * minutes is well past any ceiling we would choose ourselves and still short
 * enough that a merchant watching the screen sees it come back.
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
	let healthyStreak = 0;
	/** Timestamps of 5xx / transport failures inside the rolling window. */
	let distressAtMs: number[] = [];
	let latencySamples: number[] = [];

	const stepUp = (signal: PressureSignal, atMs: number): ServerPressureTransition | null => {
		healthyStreak = 0;
		const from = multiplier;
		const to = Math.min(multiplier * 2, maxMultiplier);
		if (to === from) return null;
		multiplier = to;
		return {
			direction: 'backoff',
			signal,
			fromMultiplier: from,
			toMultiplier: to,
			...(retryAfterUntilMs > atMs ? { retryAfterUntilMs } : {}),
		};
	};

	return {
		multiplier: () => multiplier,
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
				return retryAfterAdvanced
					? {
							direction: 'backoff',
							signal: 'rate-limited',
							fromMultiplier: multiplier,
							toMultiplier: multiplier,
							retryAfterUntilMs,
						}
					: null;
			}

			if (status === 0 || status >= 500) {
				healthyStreak = 0;
				distressAtMs = distressAtMs.filter((at) => atMs - at < PRESSURE_WINDOW_MS);
				distressAtMs.push(atMs);
				if (distressAtMs.length < PRESSURE_BURST) return null;
				// The burst has been spent — start a fresh window so the NEXT step needs
				// another three failures rather than riding the same ones up the ladder.
				distressAtMs = [];
				return stepUp(status === 0 ? 'timeout' : 'server-error', atMs);
			}

			// 4xx that is not 429 (401/403/404/409…) says something about the request,
			// not the server's load. It is neither distress nor a clean bill of health.
			const accepted = status >= 200 && status < 400;
			if (!accepted) return null;

			latencySamples.push(durationMs);
			if (latencySamples.length > SLOW_SAMPLE_COUNT) latencySamples.shift();
			if (latencySamples.length === SLOW_SAMPLE_COUNT && median(latencySamples) > SLOW_MEDIAN_MS) {
				// Drop the window with the step: without this the same ten slow samples
				// would trip every subsequent request and walk straight to the ceiling.
				latencySamples = [];
				return stepUp('slow', atMs);
			}

			healthyStreak += 1;
			if (multiplier === 1 || healthyStreak < RECOVERY_HEALTHY_RESPONSES) return null;
			healthyStreak = 0;
			const from = multiplier;
			multiplier = Math.max(1, Math.floor(multiplier / 2));
			return {
				direction: 'recovery',
				signal: 'healthy',
				fromMultiplier: from,
				toMultiplier: multiplier,
			};
		},
	};
}
