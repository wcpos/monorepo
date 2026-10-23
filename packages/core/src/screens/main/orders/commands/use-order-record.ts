import * as React from 'react';

import { type OrderPayload, type ReadonlyEngineRecord, useQueryRuntime } from '@wcpos/query';
import { patchEngineResident } from '@wcpos/query/mutations';
import { ORDER_REFRESH_TIMEOUT_MS } from '@wcpos/query/record-readers';
import { type MetaDataEntry, POS_META_KEYS } from '@wcpos/sync-core';

import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';

/** The entries a reopen stamps (`wooMetaCarrier.stampIdentity`): cashier, store, register, till. */
const REOPEN_IDENTITY_KEYS: readonly string[] = [
	POS_META_KEYS.user,
	POS_META_KEYS.store,
	POS_META_KEYS.register,
	POS_META_KEYS.till,
];
const isReopenIdentity = (entry: MetaDataEntry) =>
	!!entry.key && REOPEN_IDENTITY_KEYS.includes(entry.key);

/** The order as the reopen found it, in what the reopen changes: what an undo puts back. */
type BeforeReopen = { status: OrderPayload['status']; identity: MetaDataEntry[] };

export function useOrderRecord() {
	const { localPatch } = useLocalMutation();
	const saveOrderFields = React.useCallback(
		async (order: ReadonlyEngineRecord<'orders'>, data: Partial<OrderPayload>): Promise<boolean> =>
			!!(await localPatch({ document: order, data }))?.document,
		[localPatch]
	);
	/**
	 * Null when the local write failed; otherwise the queued row to follow, if one was queued,
	 * and the order as the reopen found it. The row is explicit: the reopen sets pos-open optimistically, and the open-cart hold would
	 * otherwise hold the very write whose verdict the caller awaits.
	 */
	const reopenOrder = React.useCallback(
		async (
			order: ReadonlyEngineRecord<'orders'>,
			data: Pick<OrderPayload, 'status' | 'meta_data'>
		): Promise<{ mutationId?: string; before: BeforeReopen } | null> => {
			const before = {
				status: order.payload.status,
				identity: (order.payload.meta_data ?? []).filter(isReopenIdentity),
			};
			const result = await localPatch({ document: order, data }, { explicit: true });
			if (!result?.document) return null;
			return { mutationId: result.mutationId, before };
		},
		[localPatch]
	);
	return { saveOrderFields, reopenOrder };
}

/**
 * Undo a reopen the store refused. Orders never auto-revert, so the optimistic pos-open stays
 * on the resident: re-adopt the store's copy (under an equal stamp, since the store's copy did
 * not change), and when that does not land, put back what the reopen changed (status and the
 * identity it stamped) on the latest payload, so anything written meanwhile stays. Nothing is
 * pushed: the store already holds the previous status.
 */
export function useUndoRefusedReopen() {
	const runtime = useQueryRuntime();
	return React.useCallback(
		async (order: ReadonlyEngineRecord<'orders'>, before: BeforeReopen) => {
			const wooId = order.payload.id;
			let readopted = false;
			if (wooId) {
				let timer: ReturnType<typeof setTimeout> | undefined;
				const timedOut = new Promise<false>((resolve) => {
					timer = setTimeout(() => resolve(false), ORDER_REFRESH_TIMEOUT_MS);
				});
				readopted = await Promise.race([runtime.engine.orderRevision.readopt(wooId), timedOut]);
				clearTimeout(timer);
			}
			if (readopted || !order.uuid) return;
			// A pull that landed meanwhile already holds the store's word; leave it.
			const latest = (order.getLatest?.() ?? order).payload;
			if (latest.status !== 'pos-open') return;
			await patchEngineResident({
				manager: runtime,
				collection: 'orders',
				recordId: order.uuid,
				changes: {
					status: before.status,
					meta_data: [
						...(latest.meta_data ?? []).filter((entry) => !isReopenIdentity(entry)),
						...before.identity,
					],
				},
			});
		},
		[runtime]
	);
}
