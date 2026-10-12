import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { type MetaDataEntry, readLedger } from '@wcpos/order-math';
import { useQueryRuntime } from '@wcpos/query';
import type { EngineRecord } from '@wcpos/query';

import { patchEngineResident, useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { settleOrderMoney } from '../../hooks/settle-order-money';
import { useCartConfig } from '../../hooks/use-cart-config';
import { parsePosData } from '../../hooks/utils';
import { voidPayments } from './void-payments';

import type { VoidPaymentsOutcome } from './void-payments';

/** Wire payment voiding to REST and the engine's offline/resident write seams. */
export function useVoidPayments(): (order: EngineRecord<'orders'>) => Promise<VoidPaymentsOutcome> {
	const http = useRestHttpClient();
	const onlineStatus = useOnlineStatus();
	const { localPatch } = useLocalMutation();
	const manager = useQueryRuntime();
	const cartConfig = useCartConfig();

	return React.useCallback(
		async (order) => {
			const payload = order.getLatest?.().payload ?? order.payload;
			// Reversing a cash leg reverses its rounding (#66, #84): a fee line whose rounding names a
			// voided row leaves (a synced one as a tombstone) with the money it moved.
			const withoutRounding = (meta_data: MetaDataEntry[]) => {
				const voided = new Set(
					readLedger(meta_data).flatMap(({ id, status }) => (status === 'voided' ? [id] : []))
				);
				const latest = order.getLatest().payload;
				let dropped = false;
				const fee_lines = (latest.fee_lines ?? []).flatMap((fee) => {
					const rounding = parsePosData(fee)?.rounding as { payment_ref?: string } | undefined;
					if (fee.name == null || !voided.has(rounding?.payment_ref ?? '')) return [fee];
					dropped = true;
					return fee.id ? [{ ...fee, name: null }] : [];
				});
				return dropped
					? { fee_lines, ...settleOrderMoney({ ...latest, fee_lines }, cartConfig).patch }
					: null;
			};
			const enqueue = async (changes: object) => {
				const result = await localPatch({ document: order, data: changes });
				if (!result) throw new Error('offline_void_local_patch_failed');
			};
			return voidPayments(
				{
					uuid: order.uuid,
					id: payload.id ?? null,
					// RxDB serves object fields as Proxies; the ledger helpers need plain data.
					meta_data: cloneDeep(payload.meta_data ?? []),
				},
				{
					post: (url, body) => http.post(url, body),
					isOnline: () => onlineStatus.status === 'online-website-available',
					patchAndEnqueue: (changes) =>
						enqueue({ ...changes, ...withoutRounding(changes.meta_data) }),
					mirror: async (changes) => {
						await patchEngineResident({
							manager,
							collection: 'orders',
							recordId: order.uuid,
							changes,
						});
						// The store holds the fee line too: its removal is intent the push must carry.
						const rounding = withoutRounding(changes.meta_data);
						if (rounding) await enqueue(rounding);
					},
				}
			);
		},
		[http, onlineStatus.status, localPatch, manager, cartConfig]
	);
}
