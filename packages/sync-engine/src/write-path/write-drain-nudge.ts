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
 * The gate's per-lane reservation makes a nudge during an active drain safe —
 * it either joins the running tick or runs one more, never two at once.
 *
 * Offline nudges are dropped: the reconnect re-tick already drains the queue
 * the moment connectivity returns, so arming a timer would only fire a
 * guaranteed skip.
 */
export function createWriteDrainNudge(options: {
	/** Fire-and-forget lane run — wire to the automatic tick gate's runLane. */
	runLane: () => void;
	/** Nudges are dropped while offline (the reconnect re-tick owns that path). */
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
	return {
		nudge: () => {
			if (disposed || pending !== null || !options.enabled() || options.isOffline()) return;
			pending = timers.setTimeout(() => {
				pending = null;
				if (disposed || !options.enabled() || options.isOffline()) return;
				options.runLane();
			}, delayMs);
		},
		dispose: () => {
			disposed = true;
			if (pending !== null) timers.clearTimeout(pending);
			pending = null;
		},
	};
}
