import * as React from 'react';

import { observeQueueRows, TERMINAL_QUEUE_STATUSES, useQueryRuntime } from '@wcpos/query';

import { clearOrderSaving, markOrderSaveRejected } from './checkout-mode';

/**
 * Mirrors the durable dead letters for orders into the checkout store. Keyed on the store
 * id as well as the engine: a same-site store switch moves the reused engine to the new
 * scope BEFORE the session commits the new store id, and `useResetCheckoutModeOnStoreChange`
 * then clears every entry — so this effect must run again after that reset, or the new
 * store's existing dead letters would lose their hold until the next queue change.
 */
export function useRejectedOrderSavesSync(storeId: number | string | undefined): void {
	const { engine } = useQueryRuntime();
	// Synchronise the checkout hold with the external, durable RxDB dead-letter query.
	React.useEffect(() => {
		let previous = new Set<string>();
		const subscription = observeQueueRows(engine, {
			statuses: TERMINAL_QUEUE_STATUSES,
			collectionName: 'orders',
		}).subscribe((rows) => {
			const current = new Set<string>();
			for (const row of rows) {
				current.add(row.recordId);
				markOrderSaveRejected(row.recordId, {
					status: row.rejectedStatus ?? null,
					reason: row.rejectedReason ?? null,
					message: row.rejectedMessage ?? null,
				});
			}
			for (const recordId of previous) if (!current.has(recordId)) clearOrderSaving(recordId);
			previous = current;
		});
		return () => subscription.unsubscribe();
	}, [engine, storeId]);
}
