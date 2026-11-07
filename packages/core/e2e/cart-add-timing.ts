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
