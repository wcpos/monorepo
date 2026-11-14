import type { EngineRecord } from '../records/engine-record';
import type { ReadonlyEngineRecord } from '../records/readonly-engine-record';

/**
 * Till-local bookkeeping bypasses the queue: the server counts its own prints,
 * and neither side reconciles the other's count.
 */
export async function recordReceiptPrint(order: ReadonlyEngineRecord<'orders'>, count: number) {
	await (order as EngineRecord<'orders'>).incrementalModify((data) => {
		const local = data.local as typeof data.local & { receiptPrintCount?: number };
		if ((local?.receiptPrintCount ?? 0) >= count) return data;
		return {
			...data,
			local: {
				...local,
				dirty: local?.dirty ?? false,
				pendingMutationIds: local?.pendingMutationIds ?? [],
				receiptPrintCount: count,
			},
		};
	});
}
