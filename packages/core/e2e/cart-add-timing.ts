// E2E-only, serial simple-product adds. Not native touch-to-paint or server acknowledgement.
type Line = { product_id?: number | null; variation_id?: number; quantity?: number };
export type CartAddMark = 'queued' | 'birthRead' | 'hooks' | 'written';
export interface CartAddTiming {
	sequence: number;
	status: 'idle' | 'pending' | 'complete' | 'overlap';
	orderId: string;
	productId: number;
	quantity: number;
	durationMs: number | null;
	marks?: Partial<Record<CartAddMark, number>>;
	startedAtEpochMs?: number;
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
let marks: Partial<Record<CartAddMark, number>> = {};
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
	marks = {};
	const sequence = snapshot.sequence + 1;
	publish({
		sequence,
		status: snapshot.status === 'pending' || snapshot.status === 'overlap' ? 'overlap' : 'pending',
		orderId,
		productId,
		quantity: quantity + 1,
		durationMs: null,
		startedAtEpochMs: Math.round(Date.now() - (performance.now() - start)),
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
	publish({
		...snapshot,
		status: 'complete',
		durationMs: performance.now() - startedAt,
		marks: { ...marks },
	});
}
export function pendingCartAddSequence(): number | undefined {
	return isCartAddTimingEnabled() && snapshot.status === 'pending' ? snapshot.sequence : undefined;
}
export function markCartAddTiming(mark: CartAddMark, sequence: number | undefined): void {
	if (!isCartAddTimingEnabled() || sequence === undefined || snapshot.sequence !== sequence) return;
	if (marks[mark] !== undefined) return;
	if (snapshot.status !== 'pending' && snapshot.status !== 'complete') return;
	marks[mark] = Math.round(performance.now() - startedAt);
	if (snapshot.status === 'complete') publish({ ...snapshot, marks: { ...marks } });
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
