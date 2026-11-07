// E2E-only, serial simple-product adds. Not native touch-to-paint or server acknowledgement.
type Line = { product_id?: number | null; variation_id?: number; quantity?: number };
export interface CartAddTiming {
	sequence: number;
	status: 'idle' | 'pending' | 'complete' | 'overlap';
	orderId: string;
	productId: number;
	quantity: number;
	durationMs: number | null;
}
let snapshot: CartAddTiming = {
	sequence: 0,
	status: 'idle',
	orderId: '',
	productId: 0,
	quantity: 0,
	durationMs: null,
};
let startedAt = 0;
const listeners = new Set<() => void>();
export const isCartAddTimingEnabled = () => process.env.EXPO_PUBLIC_WCPOS_E2E === '1';
export const getCartAddTiming = () => snapshot;
export function subscribeCartAddTiming(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
function publish(next: CartAddTiming) {
	snapshot = next;
	listeners.forEach((listener) => listener());
}
export function simpleProductQuantity(lines: readonly Line[], productId: number): number {
	return lines.reduce(
		(sum, line) =>
			line.product_id === productId && !line.variation_id ? sum + (line.quantity ?? 0) : sum,
		0
	);
}
export function beginCartAddTiming(
	orderId: string,
	productId: number,
	quantity: number,
	start: number
): number | undefined {
	if (!isCartAddTimingEnabled()) return;
	startedAt = start;
	const sequence = snapshot.sequence + 1;
	publish({
		sequence,
		status: snapshot.status === 'pending' || snapshot.status === 'overlap' ? 'overlap' : 'pending',
		orderId,
		productId,
		quantity: quantity + 1,
		durationMs: null,
	});
	return sequence;
}
export function cancelCartAddTiming(sequence: number | undefined): void {
	if (sequence === undefined || snapshot.sequence !== sequence) return;
	publish({ ...snapshot, status: 'idle', durationMs: null });
}
export function commitCartAddTiming(orderId: string, lines: readonly Line[]): void {
	if (!isCartAddTimingEnabled() || snapshot.status !== 'pending' || snapshot.orderId !== orderId)
		return;
	if (simpleProductQuantity(lines, snapshot.productId) !== snapshot.quantity) return;
	publish({ ...snapshot, status: 'complete', durationMs: performance.now() - startedAt });
}

export async function observeCartAddWrite<T>(sequence: number | undefined, write: Promise<T>) {
	let failed = true;
	try {
		const result = await write;
		failed = result === false;
		return result;
	} finally {
		if (failed) cancelCartAddTiming(sequence);
	}
}

// TEMP #3345 timing: add-stage stamps and a JS-thread stall probe, on the console route the
// WCPOS_E2E_ENGINE lines use (apps/main/lib/e2e-engine-ledger.ts), so they reach logcat.txt and
// app-console.log. This module is only required under EXPO_PUBLIC_WCPOS_E2E=1.
function writeE2eLine(line: string) {
	const hook = (globalThis as { nativeLoggingHook?: unknown }).nativeLoggingHook;
	if (typeof hook === 'function') hook(line, 1);
	else console.warn(line);
}
export function logAddStage(stage: string, recordId?: string) {
	if (!isCartAddTimingEnabled()) return;
	writeE2eLine(`WCPOS_E2E_ADD_STAGE ${JSON.stringify({ stage, recordId, at: Date.now() })}`);
}
let stallProbeStarted = false;
export function startJsStallProbe() {
	if (!isCartAddTimingEnabled() || stallProbeStarted) return;
	stallProbeStarted = true;
	let last = Date.now();
	const handle = setInterval(() => {
		const now = Date.now();
		if (now - last > 300) writeE2eLine(`WCPOS_E2E_JS_STALL ${now - last} at=${now}`);
		last = now;
	}, 100);
	(handle as { unref?: () => void }).unref?.();
}
startJsStallProbe();

// TEMP #3345 load: one WCPOS_E2E_JS_LOAD line per 5 s: CPU gauge, rAF and timer callbacks, React
// commits (apps/main/lib/e2e-react-commit-hook.js). Installed after the stall probe, uncounted.
if (isCartAddTimingEnabled()) {
	// TEMP #3345 load
	const g = globalThis as unknown as Record<string, unknown> & { __wcposE2eCommits?: number };
	const realSetInterval = g.setInterval as typeof setInterval;
	let [raf, timerCalls, timerMs] = [0, 0, 0];
	let lastCommits = g.__wcposE2eCommits ?? 0;
	const timed = (cb: unknown) =>
		typeof cb !== 'function'
			? cb
			: function (this: unknown, ...args: unknown[]) {
					const start = performance.now();
					try {
						return cb.apply(this, args);
					} finally {
						timerCalls++;
						timerMs += performance.now() - start;
					}
				};
	for (const name of ['setTimeout', 'setInterval']) {
		const real = g[name] as (...args: unknown[]) => unknown;
		g[name] = (cb: unknown, ...rest: unknown[]) => real.call(g, timed(cb), ...rest);
	}
	const realRaf = g.requestAnimationFrame as ((cb: (t: number) => void) => number) | undefined;
	if (typeof realRaf === 'function')
		g.requestAnimationFrame = (cb: (t: number) => void) =>
			realRaf.call(g, (t: number) => {
				raf++;
				return cb(t);
			});
	const handle = realSetInterval(() => {
		const start = performance.now();
		let sum = 0;
		for (let i = 0; i < 200_000; i++) sum = (sum + i) | 0;
		g.__wcposE2eSpinSink = sum;
		const spinMs = Math.round((performance.now() - start) * 10) / 10;
		const total = g.__wcposE2eCommits;
		const commits = total === undefined ? undefined : total - lastCommits;
		lastCommits = total ?? 0;
		const line = { at: Date.now(), spinMs, raf, timerCalls, timerMs: Math.round(timerMs), commits };
		writeE2eLine(`WCPOS_E2E_JS_LOAD ${JSON.stringify(line)}`);
		raf = timerCalls = timerMs = 0;
	}, 5_000);
	(handle as { unref?: () => void }).unref?.();
} // TEMP #3345 load
