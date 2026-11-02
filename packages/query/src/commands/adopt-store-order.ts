import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { refreshOrderRecord } from '../record-readers/refresh-records';

interface StoreOrderAdoption {
	/** `rejected`: the engine threw while adopting; the refresh still runs. */
	adoption: 'applied' | 'protected' | 'invalid' | 'rejected';
	/** What the catch-up refresh threw, when one ran and threw. */
	refreshError?: unknown;
}

/**
 * Adopt the store's copy of an order the till just saw paid, else pull it. Catch-up only:
 * nothing the cashier waits on may depend on it, so it never rejects. `protected` (a pending
 * local change) is expected; the refresh covers every outcome but `applied`.
 */
export async function adoptStoreOrderSnapshot(
	engine: RxdbSyncEngine,
	snapshot: Record<string, unknown>,
	orderId: number | undefined
): Promise<StoreOrderAdoption> {
	let adoption: StoreOrderAdoption['adoption'];
	try {
		adoption = await engine.adoptOrderSnapshot(snapshot);
	} catch {
		adoption = 'rejected';
	}
	if (adoption === 'applied') return { adoption };
	try {
		if (!orderId) throw new Error('payment_refresh_requires_persisted_order');
		await refreshOrderRecord(engine, orderId);
		return { adoption };
	} catch (refreshError) {
		return { adoption, refreshError };
	}
}
