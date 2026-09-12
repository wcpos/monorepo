import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { useDocField, useQueryRuntime } from '@wcpos/query';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import {
	hasSaleProvenance,
	isCompletingStatus,
	type PaymentMethodDescriptor,
} from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';

import { useRegisterSessionCollection } from '../../../../../services/register-session/use-register-session-collections';
import { requireOpenSession } from '../../../../../services/register-session/session-store';
import { readBoundRegister } from '../../../../../services/register/register-document';
import { completionMeta } from '../provenance/stamp-completion';
import { useStoreSession } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { usePushDocument } from '../../../contexts/use-push-document';
import { patchEngineResident, useLocalMutation } from '../../../hooks/mutations/use-local-mutation';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { refreshOrderRecord } from '../hooks/reconcile-completed-order';
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
export function useRecordManualPayment(
	options: {
		/**
		 * Record the local leg even while the till is online: the order's own save is still
		 * queued (roadmap#171 rule 2), so the server copy — if there is one — is stale and a
		 * payment posted against it would settle the wrong totals.
		 */
		offline?: boolean;
	} = {}
): (
	order: EngineRecord<'orders'>,
	method: PaymentMethodDescriptor,
	input: RecordManualPaymentInput
) => Promise<RecordManualPaymentOutcome> {
	const http = useRestHttpClient();
	const sessions = useRegisterSessionCollection();
	const onlineStatus = useOnlineStatus();
	const forceOffline = options.offline === true;
	const { wpCredentials, store, userDB, site } = useStoreSession();
	const sessionsOn = !!useDocField(store, (value) => value.register_sessions);
	const { localPatch } = useLocalMutation();
	const pushDocument = usePushDocument();
	const manager = useQueryRuntime();
	const t = useT();

	return React.useCallback(
		async (order, method, input) => {
			const registerId = (await readBoundRegister(userDB, site.uuid!, store.id))?.id ?? null;
			const sessionId = await requireOpenSession(sessions, registerId, sessionsOn);
			const payload = order.getLatest?.().payload ?? order.payload;
			const paymentOrder = {
				uuid: order.uuid,
				id: payload.id ?? null,
				number: payload.number,
				total: payload.total,
				// RxDB serves object fields as Proxies; the ledger helpers need plain data.
				meta_data: cloneDeep(payload.meta_data ?? []),
			};
			const outcome = await recordManualPayment(paymentOrder, method, input, {
				post: (url, body) => http.post(url, body),
				isOnline: () => !forceOffline && onlineStatus.status === 'online-website-available',
				cashierId: wpCredentials.id ?? 0,
				storeId: store.id ? store.id : null,
				registerId,
				sessionId,
				completionMeta: (meta_data) =>
					completionMeta(
						{ meta_data },
						{ userDB, siteUuid: site.uuid!, storeId: store.id, sessionId }
					),
				persistProvenance: async () => {
					const meta_data = await completionMeta(order.getLatest().payload, {
						userDB,
						siteUuid: site.uuid!,
						storeId: store.id,
						sessionId,
					});
					const patched = await localPatch({ document: order, data: { meta_data } });
					if (!patched) throw new Error('provenance_save_failed');
					await pushDocument(order);
					// Preserve the pre-stamped tuple in the subsequent payment mirror.
					paymentOrder.meta_data = meta_data;
				},
				currency: store.currency ?? '',
				dp: store.price_num_decimals ?? 2,
				patchAndEnqueue: async (changes) => {
					const result = await localPatch({ document: order, data: changes });
					if (!result) throw new Error('Payment could not be saved locally.');
				},
				fetchOrderStatus: async () => {
					const response = await http.get(`orders/${paymentOrder.id}`);
					const status = (response?.data as { status?: unknown } | undefined)?.status;
					return typeof status === 'string' ? status : null;
				},
				mirror: async (changes, { accepted }) => {
					try {
						await patchEngineResident({
							manager,
							collection: 'orders',
							recordId: order.uuid,
							changes,
						});
						if (
							accepted &&
							isCompletingStatus(changes.status ?? '') &&
							!hasSaleProvenance(changes.meta_data)
						) {
							const meta_data = await completionMeta(changes, {
								userDB,
								siteUuid: site.uuid!,
								storeId: store.id,
								sessionId,
							});
							const patched = await localPatch({ document: order, data: { meta_data } });
							if (!patched) throw new Error('provenance_save_failed');
						}
					} catch (error) {
						// The store has already answered: the money is on the order there, and only
						// this till's copy is behind. Swallowing that used to report a generic
						// "checkout failed" on a payment the store had taken, which invites the
						// cashier to take it again. Pull the store's copy so the ledger catches up,
						// then let the caller report the gap for what it is.
						if (paymentOrder.id) {
							await refreshOrderRecord(manager, paymentOrder.id).catch(() => undefined);
						}
						throw error;
					}
				},
				raiseAttention: ({ row, order: summary, reason }) => {
					const number = paymentOrder.number || paymentOrder.uuid.slice(0, 8);
					const values = { number, amount: row.amount, method: method.title };
					const message =
						reason === 'order_already_paid'
							? t('payments.refusal.already_paid', values)
							: summary?.balance
								? t('payments.refusal.exceeds_balance_with_balance', {
										...values,
										balance: summary.balance,
									})
								: t('payments.refusal.exceeds_balance', values);
					logger.error(message, {
						// Two different stories with two different answers: an order already paid
						// online needs a refund, an over-payment needs the store's balance taken
						// instead. Neither is "payment handling hit an unexpected problem".
						code:
							reason === 'order_already_paid'
								? ERROR_CODES.PAYMENT_ALREADY_PAID_ONLINE
								: ERROR_CODES.PAYMENT_EXCEEDS_BALANCE,
						showToast: true,
						terminal: {
							operationType: 'sync.record',
							outcome: 'failed',
							operationId: row.id,
						},
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
			if (outcome.kind === 'failed') {
				logger.error('Checkout failed', {
					code: ERROR_CODES.CHECKOUT_FAILED_CART_SAFE,
					showToast: true,
					toast: { title: t('pos_cart.checkout_failed') },
					context: { error: outcome.reason },
				});
			}
			return outcome;
		},
		[
			sessions,
			sessionsOn,
			userDB,
			site.uuid,
			http,
			forceOffline,
			onlineStatus.status,
			wpCredentials.id,
			store,
			localPatch,
			pushDocument,
			manager,
			t,
		]
	);
}
