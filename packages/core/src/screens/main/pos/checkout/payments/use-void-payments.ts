import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { moneyCommandPoster, useDocField, useQueryRuntime } from '@wcpos/query';
import type { EngineRecord } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';

import { useStoreSession } from '../../../../../contexts/app-state';
import { useOrderLedgerWrite } from '../../commands/use-order-ledger-write';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { sweepDeadRounding } from './rounding-sweep';
import { voidPayments } from './void-payments';

import type { VoidPaymentsOutcome } from './void-payments';

const logger = getLogger(['wcpos', 'pos', 'checkout', 'payments']);

/** Wire payment voiding to REST and the engine's offline/resident write seams. */
export function useVoidPayments(): (order: EngineRecord<'orders'>) => Promise<VoidPaymentsOutcome> {
	const http = useRestHttpClient();
	const onlineStatus = useOnlineStatus();
	const { recordLedger } = useOrderLedgerWrite();
	const manager = useQueryRuntime();
	const { store, storeDB } = useStoreSession();
	// The latest store document, not the session's snapshot (see use-tender-flow).
	const dp = useDocField(store, (value) => value.price_num_decimals) ?? 2;

	return React.useCallback(
		async (order) => {
			const latest = () => order.getLatest?.().payload ?? order.payload;
			const payload = latest();
			const enqueue = async (changes: Parameters<typeof recordLedger>[1]) => {
				const result = await recordLedger(order, changes);
				if (!result) throw new Error('offline_void_local_patch_failed');
			};
			// A void is never approval-checked; the poster journals the order as it stands.
			const post = moneyCommandPoster({
				runtime: manager,
				storeDB,
				orderUuid: order.uuid,
				post: (url, body) => http.post(url, body),
			});
			const outcome = await voidPayments(
				{
					uuid: order.uuid,
					id: payload.id ?? null,
					// RxDB serves object fields as Proxies; the ledger helpers need plain data.
					meta_data: cloneDeep(payload.meta_data ?? []),
				},
				{
					post,
					isOnline: () => onlineStatus.status === 'online-website-available',
					mirror: ({ payment, order: summary }) => post.mirror({ payment, order: summary }),
				}
			);
			// Reversing a cash leg reverses its rounding: the one sweep after every settle. The store
			// has already answered for the legs, so a failed drop must not read as a failed void, which
			// would hide the legs it did void; the next settle's sweep finishes it.
			await sweepDeadRounding(storeDB, order, dp, enqueue).catch((error: unknown) =>
				logger.warn('Rounding fee not removed after the void; the next void removes it', {
					context: {
						orderId: payload.id ?? null,
						orderUUID: order.uuid,
						error: error instanceof Error ? error.message : String(error),
					},
				})
			);
			return outcome;
		},
		[http, onlineStatus.status, recordLedger, manager, storeDB, dp]
	);
}
