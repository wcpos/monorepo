import { stripBoundary, type WedgeSettings } from './wedge-detector';

/**
 * Assembles keystrokes from an attributed (device-identified) scanner into
 * complete barcodes. Unlike the wedge heuristic there is no timing threshold —
 * device attribution already proves the keys came from a scanner — so a burst
 * ends on a terminator key (scanners usually send Enter/Tab) or, when enabled,
 * after a short settle timeout.
 */

export const BURST_SETTLE_MS = 150;
const DEFAULT_TERMINATORS = ['Enter', 'Tab'];

export interface BurstAssemblerOptions {
	/** A completed burst, configured prefix/suffix stripped. */
	onScan: (code: string) => void;
	/** Read the current prefix/suffix settings at completion time. */
	getSettings: () => Pick<WedgeSettings, 'prefix' | 'suffix'>;
	/** Set to null when the source requires an explicit terminator. */
	settleMs?: number | null;
	terminators?: string[];
	/** Injectable timers so hosts and tests control time. */
	setTimeout?: (fn: () => void, ms: number) => unknown;
	clearTimeout?: (handle: unknown) => void;
}

export interface BurstAssembler {
	/** Feed one keystroke from the attributed device. */
	push: (key: string) => void;
	/** Cancel any pending settle timer and drop the partial burst. */
	dispose: () => void;
}

export function createBurstAssembler(options: BurstAssemblerOptions): BurstAssembler {
	const settleMs = options.settleMs === undefined ? BURST_SETTLE_MS : options.settleMs;
	const terminators = options.terminators ?? DEFAULT_TERMINATORS;
	const schedule = options.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
	const cancel = options.clearTimeout ?? ((handle: unknown) => clearTimeout(handle as never));

	let stack: string[] = [];
	let timer: unknown = null;

	const clearTimer = () => {
		if (timer !== null) {
			cancel(timer);
			timer = null;
		}
	};

	const complete = () => {
		clearTimer();
		if (stack.length === 0) {
			return;
		}
		const settings = options.getSettings();
		const code = stripBoundary(stack, { threshold: 0, ...settings });
		stack = [];
		if (code.length > 0) {
			options.onScan(code);
		}
	};

	const push = (key: string) => {
		if (terminators.includes(key)) {
			complete();
			return;
		}
		// Only printable keys join the code (modifiers arrive as named keys).
		if (key.length !== 1) {
			return;
		}
		stack.push(key);
		clearTimer();
		if (settleMs !== null) {
			timer = schedule(complete, settleMs);
		}
	};

	return {
		push,
		dispose: () => {
			clearTimer();
			stack = [];
		},
	};
}
