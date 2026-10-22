import * as React from 'react';

import { type EngineRecord, type OrderPayload, useQueryRuntime } from '@wcpos/query';
import { patchEngineResident } from '@wcpos/query/mutations';
import { refreshOrderRecord } from '@wcpos/query/record-readers';

import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

export function useOrderRecord() {
	const { localPatch } = useLocalMutation();
	const saveOrderFields = React.useCallback(
		async (order: EngineRecord<'orders'>, data: Partial<OrderPayload>): Promise<boolean> =>
			!!(await localPatch({ document: order, data }))?.document,
		[localPatch]
	);
	/**
	 * Null when the local write failed; otherwise the queued row to follow, if one was queued.
	 * The row is explicit: the reopen sets pos-open optimistically, and the open-cart hold would
	 * otherwise hold the very write whose verdict the caller awaits.
	 */
	const reopenOrder = React.useCallback(
		async (
			order: EngineRecord<'orders'>,
			data: Pick<OrderPayload, 'status' | 'meta_data'>
		): Promise<{ mutationId?: string } | null> => {
			const result = await localPatch({ document: order, data }, { explicit: true });
			if (!result?.document) return null;
			return { mutationId: result.mutationId };
		},
		[localPatch]
	);
	return { saveOrderFields, reopenOrder };
}

/**
 * Undo a reopen the store refused. Orders never auto-revert, so the optimistic pos-open stays
 * on the resident: re-adopt the store's copy (under an equal stamp, since the store's copy did
 * not change), and when that does not land, put the previous status back locally. Nothing is
 * pushed: the store already holds the previous status.
 */
export function useUndoRefusedReopen() {
	const runtime = useQueryRuntime();
	return React.useCallback(
		async (order: EngineRecord<'orders'>, previousStatus: OrderPayload['status']) => {
			const wooId = order.payload.id;
			let readopted = false;
			if (wooId) {
				try {
					readopted =
						(await refreshOrderRecord(runtime.engine, wooId, { readopt: true })) === 'refreshed';
				} catch {
					readopted = false;
				}
			}
			if (readopted || !order.uuid) return;
			// A pull that landed meanwhile already holds the store's word; leave it.
			if ((order.getLatest?.() ?? order).payload.status !== 'pos-open') return;
			await patchEngineResident({
				manager: runtime,
				collection: 'orders',
				recordId: order.uuid,
				changes: { status: previousStatus },
			});
		},
		[runtime]
	);
}
