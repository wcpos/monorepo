/**
 * The wedge (HID keyboard mode) detector: decides whether a keystroke stream is
 * a scanner burst or a person typing, using a folded running average of
 * inter-key gaps against a configurable threshold.
 *
 * This file is the single implementation of those semantics. The live hook in
 * `@wcpos/core` streams keys through `createWedgeDetector`, and the settings
 * test panel replays completed traces through `replayWedgeDetector` — both fold
 * every key through the same `foldWedgeKey` reducer, so the panel can never
 * disagree with what the app actually does.
 */

export interface WedgeSettings {
	/** Folded-average gap (ms) below which input latches as a scan. */
	threshold: number;
	/** Configured prefix character — stripped only when it equals the first key. */
	prefix: string;
	/** Configured suffix character — stripped only when it equals the last key. */
	suffix: string;
}

export interface WedgeState {
	avg: number;
	detecting: boolean;
	stack: string[];
	lastTimeMs: number | null;
	/** Lowest folded average reached — the value a threshold suggestion must clear. */
	minAvgGapMs: number;
}

export function createWedgeState(): WedgeState {
	return {
		avg: 0,
		detecting: false,
		stack: [],
		lastTimeMs: null,
		minAvgGapMs: Number.POSITIVE_INFINITY,
	};
}

/**
 * Fold one keystroke into the detector state. Mutates and returns `state`.
 *
 * Semantics (kept bug-for-bug with the original hook):
 * - only printable (length-1) keys advance timing or the stack;
 * - with no previous keystroke the gap is +Infinity, so the first key after
 *   mount can never read as scanner-fast;
 * - the average folds as `(avg + gap) / 2`, not a whole-trace mean;
 * - scanning latches the first time the folded average drops under the
 *   threshold and stays latched for the rest of the burst;
 * - a slow key outside a burst resets the average and restarts the stack.
 */
export function foldWedgeKey(
	state: WedgeState,
	key: string,
	timeMs: number,
	threshold: number
): WedgeState {
	if (key.length !== 1) {
		return state;
	}

	let gap = Number.POSITIVE_INFINITY;
	if (state.lastTimeMs !== null) {
		gap = timeMs - state.lastTimeMs;
	}
	state.avg = state.avg === 0 ? gap : (state.avg + gap) / 2;
	if (Number.isFinite(state.avg)) {
		state.minAvgGapMs = Math.min(state.minAvgGapMs, state.avg);
	}

	if (state.detecting || state.avg < threshold) {
		state.detecting = true;
		state.stack.push(key);
	} else {
		state.avg = 0;
		state.stack = [key];
	}

	state.lastTimeMs = timeMs;
	return state;
}

/**
 * The detector strips a configured prefix/suffix only when it equals the
 * single key at that edge of the stack — never as a substring.
 */
export function stripBoundary(stack: string[], settings: WedgeSettings): string {
	const inputStack = [...stack];
	if (settings.prefix && inputStack[0] === settings.prefix) {
		inputStack.shift();
	}
	if (settings.suffix && inputStack[inputStack.length - 1] === settings.suffix) {
		inputStack.pop();
	}
	return inputStack.join('');
}

export interface WedgeReplayResult {
	/** Whether the detector would latch onto this trace as a scan. */
	detectedAsScan: boolean;
	/** The barcode the detector would emit (prefix/suffix stripped). */
	code: string;
	/** Lowest folded average reached over the trace. */
	minAvgGapMs: number;
}

export interface TraceKey {
	key: string;
	timeMs: number;
}

/** Replay the detector over a completed keystroke trace. */
export function replayWedgeDetector(keys: TraceKey[], settings: WedgeSettings): WedgeReplayResult {
	const state = createWedgeState();
	for (const entry of keys) {
		foldWedgeKey(state, entry.key, entry.timeMs, settings.threshold);
	}
	if (!state.detecting) {
		return { detectedAsScan: false, code: '', minAvgGapMs: state.minAvgGapMs };
	}
	return {
		detectedAsScan: true,
		code: stripBoundary(state.stack, settings),
		minAvgGapMs: state.minAvgGapMs,
	};
}

/** End-of-scan settle: a burst is complete this long after its last key. */
export const WEDGE_END_OF_SCAN_MS = 150;

export interface WedgeDetectorOptions {
	/** Read the current settings — called per keystroke so live changes apply. */
	getSettings: () => WedgeSettings;
	/** A completed burst, prefix/suffix already stripped. */
	onScan: (code: string) => void;
	/** Injectable clock/timers so hosts and tests control time. */
	now?: () => number;
	setTimeout?: (fn: () => void, ms: number) => unknown;
	clearTimeout?: (handle: unknown) => void;
}

export interface WedgeDetector {
	/** Feed one keystroke; `timeMs` defaults to `now()`. */
	handleKey: (key: string, timeMs?: number) => void;
	/** Cancel any pending end-of-scan timer (host teardown). */
	dispose: () => void;
}

/**
 * The live, streaming form of the detector: feeds keys through `foldWedgeKey`
 * and emits a scan once the burst has been quiet for `WEDGE_END_OF_SCAN_MS`
 * (and the quiet period exceeds the threshold, mirroring the original hook).
 */
export function createWedgeDetector(options: WedgeDetectorOptions): WedgeDetector {
	const now = options.now ?? Date.now;
	const schedule = options.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
	const cancel = options.clearTimeout ?? ((handle: unknown) => clearTimeout(handle as never));

	let state = createWedgeState();
	let timer: unknown = null;

	const clearTimer = () => {
		if (timer !== null) {
			cancel(timer);
			timer = null;
		}
	};

	const handleKey = (key: string, timeMs?: number) => {
		if (key.length !== 1) {
			return;
		}
		const settings = options.getSettings();
		foldWedgeKey(state, key, timeMs ?? now(), settings.threshold);

		if (!state.detecting) {
			return;
		}
		clearTimer();
		timer = schedule(() => {
			timer = null;
			const current = options.getSettings();
			if (state.detecting && now() - (state.lastTimeMs || 0) > current.threshold) {
				const code = stripBoundary(state.stack, current);
				// Reset for the next burst (lastTimeMs is deliberately kept, as before).
				const lastTimeMs = state.lastTimeMs;
				state = createWedgeState();
				state.lastTimeMs = lastTimeMs;
				options.onScan(code);
			}
		}, WEDGE_END_OF_SCAN_MS);
	};

	return { handleKey, dispose: clearTimer };
}
