import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { fromMinor, readLedger, toMinor } from '@wcpos/order-math';
import { useQueryRuntime } from '@wcpos/query';
import type { EngineRecord } from '@wcpos/query';

import { useStoreSession } from '../../../../../contexts/app-state';
import { patchEngineResident, useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { parsePosData } from '../../hooks/utils';
import { voidPayments } from './void-payments';

import type { VoidPaymentsOutcome } from './void-payments';

/** Wire payment voiding to REST and the engine's offline/resident write seams. */
export function useVoidPayments(): (order: EngineRecord<'orders'>) => Promise<VoidPaymentsOutcome> {
	const http = useRestHttpClient();
	const onlineStatus = useOnlineStatus();
	const { localPatch } = useLocalMutation();
	const manager = useQueryRuntime();
	const { store } = useStoreSession();
	const dp = store.price_num_decimals ?? 2;

	return React.useCallback(
		async (order) => {
			const latest = () => order.getLatest?.().payload ?? order.payload;
			const payload = latest();
			const enqueue = async (changes: object) => {
				const result = await localPatch({ document: order, data: changes });
				if (!result) throw new Error('offline_void_local_patch_failed');
			};
			const outcome = await voidPayments(
				{
					uuid: order.uuid,
					id: payload.id ?? null,
					// RxDB serves object fields as Proxies; the ledger helpers need plain data.
					meta_data: cloneDeep(payload.meta_data ?? []),
				},
				{
					post: (url, body) => http.post(url, body),
					isOnline: () => onlineStatus.status === 'online-website-available',
					patchAndEnqueue: enqueue,
					mirror: async (changes) => {
						await patchEngineResident({
							manager,
							collection: 'orders',
							recordId: order.uuid,
							changes,
						});
					},
				}
			);
			// Reversing a cash leg reverses its rounding (#66, #84). A sweep of the latest ledger, not
			// of this call's rows, so a drop that failed is finished by the next void. A synced fee
			// leaves as a tombstone; the stored total moves by the fee money alone (ADR 0032).
			const after = latest();
			const voided = new Set(
				readLedger(after.meta_data ?? []).flatMap(({ id, status }) =>
					status === 'voided' ? [id] : []
				)
			);
			let dropped = false;
			let droppedMinor = 0;
			const fees = after.fee_lines ?? [];
			const fee_lines = fees.flatMap((fee) => {
				const rounding = parsePosData(fee)?.rounding as { payment_ref?: string } | undefined;
				if (fee.name == null || !voided.has(rounding?.payment_ref ?? '')) return [fee];
				dropped = true;
				droppedMinor += toMinor(fee.total, dp) + toMinor(fee.total_tax, dp);
				return fee.id ? [{ ...fee, name: null }] : [];
			});
			if (dropped)
				await enqueue({
					fee_lines,
					total: fromMinor(toMinor(after.total, dp) - droppedMinor, dp),
				});
			return outcome;
		},
		[http, onlineStatus.status, localPatch, manager, dp]
	);
}
