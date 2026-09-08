// E2E-only, serial simple-product adds. Not native touch-to-paint or server acknowledgement.
type Line = { product_id?: number | null; variation_id?: number; quantity?: number };
type TimingGlobal = typeof globalThis & { __WCPOS_E2E_CART_TIMING__?: boolean };
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
export const isCartAddTimingEnabled = () =>
	process.env.EXPO_PUBLIC_WCPOS_E2E === '1' ||
	(globalThis as TimingGlobal).__WCPOS_E2E_CART_TIMING__ === true;
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
): void {
	if (!isCartAddTimingEnabled()) return;
	startedAt = start;
	publish({
		sequence: snapshot.sequence + 1,
		status: snapshot.status === 'pending' ? 'overlap' : 'pending',
		orderId,
		productId,
		quantity: quantity + 1,
		durationMs: null,
	});
}
export function commitCartAddTiming(orderId: string, lines: readonly Line[]): void {
	if (!isCartAddTimingEnabled() || snapshot.status !== 'pending' || snapshot.orderId !== orderId)
		return;
	if (simpleProductQuantity(lines, snapshot.productId) !== snapshot.quantity) return;
	publish({ ...snapshot, status: 'complete', durationMs: performance.now() - startedAt });
}
