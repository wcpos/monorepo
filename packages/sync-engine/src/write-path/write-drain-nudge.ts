import { type EngineTimers, systemTimers } from '../engine-timers';

/**
 * How long an enqueued write may wait before the drain is kicked. Long enough
 * that a burst of edits (a cashier tabbing through fields) coalesces into one
 * push, short enough that a single edit feels immediate — the write-drain
 * lane's 10s poll is a durability backstop, not a UX budget.
 */
export const WRITE_DRAIN_NUDGE_DELAY_MS = 300;

export type WriteDrainNudge = {
	/** An intent was durably enqueued — kick the drain soon (coalesced). */
	nudge(): void;
	dispose(): void;
};

/**
 * Enqueue-time kick for the write-drain lane. `engine.write()` is
 * enqueue-only by design (ADR 0018 — durability first), and the lane's
 * interval timer was the ONLY drain trigger while online, so every optimistic
 * edit waited 0–10s before its push even left the device. The nudge closes
 * that gap without touching the durability contract: the write is already
 * queued before the timer arms, and the lane run itself still owns leases,
 * retries, and batching.
 *
 * Coalescing is first-edge: the first nudge arms one timer and later nudges
 * ride it, so a burst becomes one drain no more than `delayMs` after the
 * burst began (a trailing debounce could starve under continuous edits).
 * The lane run is requested FRESH (gate.runLaneFresh): a drain already in
 * flight snapshotted its queue before this nudge's mutation landed, so the
 * nudge must never be satisfied by joining it.
 *
 * An offline nudge is RETAINED, not dropped: the timer re-arms until
 * connectivity returns, then drains. The gate's reconnect re-tick only fires
 * when one of its own lane invocations observed the offline state — an outage
 * that begins and ends between ticks is invisible to it, so dropping the
 * nudge could strand the write until the interval. The re-arm loop is a local
 * connectivity read every `delayMs`; no network traffic until it fires.
 */
export function createWriteDrainNudge(options: {
	/** Fire-and-forget lane run — wire to the automatic tick gate's runLaneFresh. */
	runLane: () => void;
	/** While true the armed timer re-arms instead of firing (retained, not dropped). */
	isOffline: () => boolean;
	/** Nudges are dropped when false — manual mode drives ticks via sync(). */
	enabled: () => boolean;
	timers?: EngineTimers;
	delayMs?: number;
}): WriteDrainNudge {
	const timers = options.timers ?? systemTimers;
	const delayMs = options.delayMs ?? WRITE_DRAIN_NUDGE_DELAY_MS;
	let pending: ReturnType<typeof setTimeout> | null = null;
	let disposed = false;
	const arm = (): void => {
		pending = timers.setTimeout(() => {
			pending = null;
			if (disposed || !options.enabled()) return;
			if (options.isOffline()) {
				// Retain until reconnect — see the module doc.
				arm();
				return;
			}
			options.runLane();
		}, delayMs);
		timers.unref(pending);
	};
	return {
		nudge: () => {
			if (disposed || pending !== null || !options.enabled()) return;
			arm();
		},
		dispose: () => {
			disposed = true;
			if (pending !== null) timers.clearTimeout(pending);
			pending = null;
		},
	};
}
