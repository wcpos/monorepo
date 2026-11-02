import * as React from 'react';

import {
	observeQueueRows,
	PARKED_QUEUE_STATUSES,
	TERMINAL_QUEUE_STATUSES,
	useQueryRuntime,
} from '@wcpos/query';

import { clearOrderSaving, getOrderSaveState, markOrderSaveRejected } from './checkout-mode';
import { refusedWireOf } from './refused-wire';

/**
 * Mirrors the durable dead letters for orders into the checkout store. Keyed on the store
 * id as well as the engine: a same-site store switch moves the reused engine to the new
 * scope BEFORE the session commits the new store id, and `useResetCheckoutModeOnStoreChange`
 * then clears every entry — so this effect must run again after that reset, or the new
 * store's existing dead letters would lose their hold until the next queue change.
 */
export function useRejectedOrderSavesSync(storeId: number | string | undefined): void {
	const runtime = useQueryRuntime();
	// Synchronise the checkout hold with the external, durable RxDB dead-letter query.
	React.useEffect(() => {
		// Record id -> the mutation id of its newest dead letter, as last mirrored.
		let previous = new Map<string, string>();
		const subscription = observeQueueRows(runtime.engine, {
			statuses: TERMINAL_QUEUE_STATUSES,
			collectionName: 'orders',
		}).subscribe((rows) => {
			// The newest dead letter per record: greatest `queuedAt`, the later row on a tie.
			const newest = new Map<string, (typeof rows)[number]>();
			for (const row of rows) {
				const seen = newest.get(row.recordId);
				if (!seen || !(row.queuedAt < seen.queuedAt)) newest.set(row.recordId, row);
			}
			for (const [recordId, row] of newest) {
				// A save in flight over a dead letter already mirrored is Pay's retry: keep its
				// pane on the wait. A new dead letter is a new refusal and always marks.
				const kind = getOrderSaveState(recordId)?.kind;
				const retrying = kind === 'saving' || kind === 'queued-offline';
				if (retrying && previous.get(recordId) === row.mutationId) continue;
				markOrderSaveRejected(recordId, {
					status: row.rejectedStatus ?? null,
					reason: row.rejectedReason ?? null,
					message: row.rejectedMessage ?? null,
					refused: refusedWireOf(row.payload),
					// A parked row blocks every later write of the record; only a dead letter may be retried.
					parked: (PARKED_QUEUE_STATUSES as readonly string[]).includes(row.status),
				});
			}
			// The mirror owns only the hold: a retry's wait belongs to the save hook, which
			// settles it itself, so a row discarded under a retry in flight clears nothing.
			for (const recordId of previous.keys())
				if (!newest.has(recordId) && getOrderSaveState(recordId)?.kind === 'rejected')
					clearOrderSaving(recordId);
			previous = new Map([...newest].map(([recordId, row]) => [recordId, row.mutationId]));
		});
		return () => subscription.unsubscribe();
	}, [runtime.engine, storeId]);
}
