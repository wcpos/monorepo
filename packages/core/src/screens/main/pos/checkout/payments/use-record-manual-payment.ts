import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { PaymentMethodDescriptor } from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';

import { useStoreSession } from '../../../../../contexts/app-state';
import { patchEngineResident, useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { recordManualPayment } from './record-manual-payment';

import type { RecordManualPaymentInput, RecordManualPaymentOutcome } from './record-manual-payment';

const logger = getLogger(['wcpos', 'payments']);

/**
 * Wire `recordManualPayment` to the till: REST client, online status, cashier/store
 * identity, the local-mutation seam (offline rows ride the order write) and the
 * resident-only patch (online rows mirror the server's copy).
 *
 * A refused row raises a needs-attention entry through the log ledger: the Store
 * health attention list is DERIVED from `sync.record` rows with a failed outcome
 * (`logs-logic.ts` `deriveStuckRecords`), and shows `context.reason` as its line —
 * so the cashier-readable sentence goes there, the machine reason beside it.
 */
export function useRecordManualPayment(): (
	order: EngineRecord<'orders'>,
	method: PaymentMethodDescriptor,
	input: RecordManualPaymentInput
) => Promise<RecordManualPaymentOutcome> {
	const http = useRestHttpClient();
	const onlineStatus = useOnlineStatus();
	const { wpCredentials, store } = useStoreSession();
	const { localPatch } = useLocalMutation();
	const manager = useQueryRuntime();

	return React.useCallback(
		async (order, method, input) => {
			const payload = order.getLatest?.().payload ?? order.payload;
			const paymentOrder = {
				uuid: order.uuid,
				id: payload.id ?? null,
				number: payload.number,
				// RxDB serves object fields as Proxies; the ledger helpers need plain data.
				meta_data: cloneDeep(payload.meta_data ?? []),
			};
			return recordManualPayment(paymentOrder, method, input, {
				post: (url, body) => http.post(url, body),
				isOnline: () => onlineStatus.status === 'online-website-available',
				cashierId: wpCredentials.id ?? 0,
				storeId: store.id ? store.id : null,
				currency: store.currency ?? '',
				dp: store.price_num_decimals ?? 2,
				patchAndEnqueue: async (changes) => {
					await localPatch({ document: order, data: changes });
				},
				mirror: async (changes) => {
					await patchEngineResident({
						manager,
						collection: 'orders',
						recordId: order.uuid,
						changes,
					});
				},
				raiseAttention: ({ row, order: summary, reason }) => {
					const number = paymentOrder.number || paymentOrder.uuid.slice(0, 8);
					const message =
						reason === 'order_already_paid'
							? `Order #${number} was already paid online; ${row.amount} ${method.title} was also taken at the till — refund the ${row.kind === 'cash' ? 'cash' : 'payment'}.`
							: `Order #${number}${summary?.balance ? ` only had ${summary.balance} outstanding` : ''}; ${row.amount} ${method.title} was taken at the till — refund the difference.`;
					logger.error(message, {
						code:
							reason === 'order_already_paid'
								? ERROR_CODES.PAYMENT_ALREADY_PAID_ONLINE
								: ERROR_CODES.PAYMENT_UNEXPECTED,
						showToast: true,
						terminal: { operationType: 'sync.record', outcome: 'failed' },
						context: {
							collection: 'orders',
							recordId: paymentOrder.uuid,
							direction: 'push',
							type: 'payment.refused',
							reason: message,
							refusal: reason,
							paymentId: row.id,
							orderId: paymentOrder.id,
							amount: row.amount,
							methodId: row.method_id,
						},
					});
				},
			});
		},
		[http, onlineStatus.status, wpCredentials.id, store, localPatch, manager]
	);
}
