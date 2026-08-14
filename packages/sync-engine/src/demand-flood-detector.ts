/**
 * Demand-path flood DETECTOR (#1134 item 2, owner ruling 2026-08-14).
 *
 * The ruling, restated: the demand path stays UNCAPPED — `LANE_REGISTRY`
 * deliberately declares `maxRequestsPerTick: null` for the demand lanes
 * (mono#1133 review, codex r3760800564), and the cashier-expectation principle
 * means the engine adapts to the cashier, never the reverse. What the demand
 * path gets instead is a passive sanity alarm: count demand-path requests per
 * detector tick and raise a durable, Store-health-visible event when the count
 * stays over a threshold no legitimate burst sustains. Detection only — this
 * module never delays, queues, or drops a request. `countRequest` is a
 * synchronous increment; the fetch it observes proceeds unconditionally.
 *
 * Threshold derivation (evidence, not vibes):
 *  - Human-driven demand peaks are an order of magnitude below the threshold:
 *    a hot scanner issues ~1-2 targeted pulls/s (≤ ~120/min), a browse scroll
 *    fetches 100-row pages at human pace, and a big-cart reference pull is
 *    include-chunked at ≤ 50 ids per request (single digits per cart).
 *  - Budgeted demand work is bounded well below it: a scheduler task keeps the
 *    background per-task budget (`ORDER_SCHEDULER_MAX_REQUESTS` = 100
 *    requests per drain), and the politeness spec's audit rounds are single
 *    digits per pass.
 *  - The one unbudgeted legitimate shape — fetch-to-completion (Reports
 *    limit:'all', the explicit full order refresh) — is bounded by catalogue
 *    size and serialized behind the one require-plane queue: 10k orders at
 *    250/page is ~40 requests, a 100k-order walk ~400 total, and serial pacing
 *    against a production WooCommerce (~200-500 ms/response → 2-5 req/s) tops
 *    out near 300 requests/min, transiently.
 *  - So: >300 requests/min, for 3 CONSECUTIVE minutes (>900 requests with no
 *    quiet minute), is order-of-10x beyond the total volume of any bounded
 *    legitimate burst in evidence and beyond the serial rate a production
 *    server sustains. The runaway class this exists to catch (#888
 *    refetch-churn) floods INDEFINITELY, so it crosses within minutes, while a
 *    single legitimate spike can breach at most a window or two and never
 *    alarms.
 *
 * Anti-spam: one event per breach EPISODE. The alarm latches after the Nth
 * consecutive breaching tick and stays silent while the flood continues; any
 * tick at or below the threshold (including a fully idle gap) re-arms it, so a
 * recovery followed by a second flood reports again.
 *
 * Timer-free by design: ticks are evaluated lazily, on the first count that
 * lands beyond the open tick's window. A flood keeps counting, so its ticks
 * close promptly; an idle detector holds no resources and needs no disposal.
 */

import type { SyncObserver } from '@wcpos/sync-core';

/** The detector's counting window ("tick"). */
export const DEMAND_FLOOD_TICK_MS = 60_000;
/** Requests per tick a tick must EXCEED to count as breaching (see derivation above). */
export const DEMAND_FLOOD_REQUESTS_PER_TICK = 300;
/** Consecutive breaching ticks before the alarm fires — a lone spike never alarms. */
export const DEMAND_FLOOD_CONSECUTIVE_TICKS = 3;

export type DemandFloodDetector = {
	/**
	 * Record one demand-path request for `scopeId`. Synchronous, never throws,
	 * never returns anything a caller could wait on — provably passive.
	 */
	countRequest(scopeId: string): void;
};

export type DemandFloodDetectorDeps = {
	diagnostics: SyncObserver;
	now?: () => number;
	/** Test seams; production callers take the derived constants above. */
	tickMs?: number;
	requestsPerTick?: number;
	consecutiveTicks?: number;
};

type ScopeState = {
	tickStartMs: number;
	count: number;
	/** Consecutive breaching ticks ending at the last closed tick. */
	breaches: number;
	/** Latched after the alarm fires; a sub-threshold tick re-arms. */
	alarmed: boolean;
};

export function createDemandFloodDetector(deps: DemandFloodDetectorDeps): DemandFloodDetector {
	const now = deps.now ?? Date.now;
	const tickMs = deps.tickMs ?? DEMAND_FLOOD_TICK_MS;
	const threshold = deps.requestsPerTick ?? DEMAND_FLOOD_REQUESTS_PER_TICK;
	const consecutiveTicks = deps.consecutiveTicks ?? DEMAND_FLOOD_CONSECUTIVE_TICKS;
	const scopes = new Map<string, ScopeState>();

	const closeTick = (scopeId: string, state: ScopeState): void => {
		if (state.count > threshold) {
			state.breaches += 1;
			if (!state.alarmed && state.breaches >= consecutiveTicks) {
				state.alarmed = true;
				try {
					deps.diagnostics({
						type: 'demand.flood-detected',
						level: 'warn',
						message: `Demand-path request flood: ${state.count} requests in ${Math.round(tickMs / 1000)}s (threshold ${threshold}) for ${state.breaches} consecutive ticks`,
						fields: {
							requests: state.count,
							threshold,
							windowMs: tickMs,
							consecutiveTicks: state.breaches,
							scopeId,
						},
					});
				} catch {
					// Telemetry is best-effort; a throwing sink must never touch the demand path.
				}
			}
		} else {
			// Recovery: any tick at or below the threshold ends the episode and re-arms.
			state.breaches = 0;
			state.alarmed = false;
		}
		state.count = 0;
	};

	return {
		countRequest(scopeId) {
			const at = now();
			let state = scopes.get(scopeId);
			if (!state) {
				state = { tickStartMs: at, count: 0, breaches: 0, alarmed: false };
				scopes.set(scopeId, state);
			}
			if (at - state.tickStartMs >= tickMs) {
				// The open tick closes with its recorded count …
				closeTick(scopeId, state);
				const elapsedTicks = Math.floor((at - state.tickStartMs) / tickMs);
				if (elapsedTicks > 1) {
					// … and any FULLY idle tick between it and `at` counted zero
					// requests, which is below threshold: recovery, folded into one
					// step instead of iterating an unbounded idle gap.
					state.breaches = 0;
					state.alarmed = false;
				}
				state.tickStartMs += elapsedTicks * tickMs;
			}
			state.count += 1;
		},
	};
}
