import * as React from 'react';

import { useDocField, useQueryRuntime } from '@wcpos/query';
import type { OrderPayload, ReadonlyEngineRecord } from '@wcpos/query';
import { patchEngineResident } from '@wcpos/query/mutations';
import { ORDER_REFRESH_TIMEOUT_MS } from '@wcpos/query/record-readers';
import { type MetaDataEntry, POS_META_KEYS } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import { useLocalMutation } from '../../hooks/mutations/use-local-mutation';
import { useBaseTaxLocation } from '../../hooks/use-base-tax-location';
import { useAppState } from '../../../../contexts/app-state';
import { useT } from '../../../../contexts/translations';
import { refusesTaxLocationMove } from '../../pos/commands/tax-location-lock';

const logger = getLogger(['wcpos', 'orders']);

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
	const base = useBaseTaxLocation();
	const basis = useDocField(useAppState().store, (value) => value.tax_based_on);
	const t = useT();
	// The Edit tab manages an order; it is not the till ringing it up, so none of its writes add
	// this device's register or till rows to an order without them. A reopen does (`reopenOrder`).
	// A resolver is applied to the payload the write lands on; one that finds nothing to change
	// writes nothing and resolves false.
	const saveOrderFields = React.useCallback(
		async (
			order: ReadonlyEngineRecord<'orders'>,
			data: Partial<OrderPayload> | ((payload: OrderPayload) => Partial<OrderPayload>)
		): Promise<boolean> => {
			if (typeof data === 'function') {
				let refused = false;
				const changes = (payload: Record<string, unknown>) => {
					const patch = data(payload as OrderPayload);
					refused = refusesTaxLocationMove(payload, patch, base, basis);
					return refused ? {} : patch;
				};
				const result = await localPatch({ document: order, changes }, { stampTill: false });
				if (!refused) return !!result?.document && Object.keys(result.changes).length > 0;
			} else if (
				!refusesTaxLocationMove((order.getLatest?.() ?? order).payload, data, base, basis)
			) {
				return !!(await localPatch({ document: order, data }, { stampTill: false }))?.document;
			}
			const context = { orderId: order.uuid };
			logger.warn(t('pos_cart.tax_location_locked'), { showToast: true, context });
			return false;
		},
		[localPatch, base, basis, t]
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
