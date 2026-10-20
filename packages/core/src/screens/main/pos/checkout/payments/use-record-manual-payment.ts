import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import { moneyCommandPoster, useDocField, useQueryRuntime } from '@wcpos/query';
import { mirrorServerOrder } from '@wcpos/query/mutations';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import {
	hasSaleProvenance,
	isCompletingStatus,
	type PaymentMethodDescriptor,
} from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';

import { useStoreSession } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { pushFailureCode } from '../../../contexts/push-failure-code';
import { useOrderLedgerWrite } from '../../commands/use-order-ledger-write';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';
import { completionMetaFor, persistSaleProvenance, refreshOrderRecord } from '../sale-completion';
import { commandProvenance } from '../provenance/command-provenance';
import { useSaleContext } from '../hooks/use-sale-context';
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
	input: RecordManualPaymentInput & {
		/** The ids the tender gates stamped: every manual leg passes the gates before it is written. */
		session: { registerId: string | null; sessionId: string | null };
	}
) => Promise<RecordManualPaymentOutcome> {
	const http = useRestHttpClient();
	const ctx = useSaleContext();
	const onlineStatus = useOnlineStatus();
	const forceOffline = options.offline === true;
	const { wpCredentials, store, storeDB } = useStoreSession();
	// The latest store document, not the session's snapshot (see use-tender-flow).
	const storeCurrency = useDocField(store, (value) => value.currency) ?? '';
	const storeDecimals = useDocField(store, (value) => value.price_num_decimals) ?? 2;
	const { stampCompletion } = useOrderLedgerWrite();
	const manager = useQueryRuntime();
	const t = useT();

	return React.useCallback(
		async (order, method, input) => {
			const { registerId, sessionId } = input.session;
			const payload = order.getLatest?.().payload ?? order.payload;
			const paymentOrder = {
				uuid: order.uuid,
				id: payload.id ?? null,
				number: payload.number,
				total: payload.total,
				// RxDB serves object fields as Proxies; the ledger helpers need plain data.
				meta_data: cloneDeep(payload.meta_data ?? []),
			};
			let provenanceError: unknown;
			const post = moneyCommandPoster({
				runtime: manager,
				storeDB,
				orderUuid: order.uuid,
				post: (url, body) => http.post(url, body),
				approval: input.approval ?? {
					total: String(payload.total ?? ''),
					currency: payload.currency ?? storeCurrency,
				},
				provenance: (command) => commandProvenance(ctx, order, sessionId, command),
			});
			const outcome = await recordManualPayment(paymentOrder, method, input, {
				post,
				isOnline: () => !forceOffline && onlineStatus.status === 'online-website-available',
				cashierId: wpCredentials.id ?? 0,
				storeId: store.id ? store.id : null,
				registerId,
				sessionId,
				persistProvenance: async () => {
					try {
						await persistSaleProvenance(ctx, {
							order,
							sessionId,
							online: true,
							extraMeta: input.extraMeta,
						});
					} catch (error) {
						// recordManualPayment turns this into its `provenance_save_failed` outcome;
						// the push itself reports nothing, so the cause is kept for that one report.
						provenanceError = error;
						throw error;
					}
					paymentOrder.meta_data = cloneDeep(order.getLatest().payload.meta_data ?? []);
				},
				// The order's own currency wins (see use-tender-flow); the store's only when it has none.
				currency: payload.currency || storeCurrency,
				dp: storeDecimals,
				fetchOrderStatus: async () => {
					const response = await http.get(`orders/${paymentOrder.id}`);
					const status = (response?.data as { status?: unknown } | undefined)?.status;
					return typeof status === 'string' ? status : null;
				},
				mirror: async ({ payment, status }, { accepted }) => {
					try {
						await mirrorServerOrder(manager, order.uuid, {
							payment,
							order: status ? ({ status } as never) : null,
							sentRevision: post.sentRevision(),
						});
						await post.settle();
						const latestMeta = cloneDeep(order.getLatest().payload.meta_data ?? []);
						if (accepted && isCompletingStatus(status ?? '') && !hasSaleProvenance(latestMeta)) {
							const meta_data = await completionMetaFor(ctx, latestMeta, {
								sessionId,
								extraMeta: input.extraMeta,
							});
							const patched = await stampCompletion(order, meta_data);
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
				// The provenance push's failure, or the money command's refused pre-flight push.
				const cause = provenanceError ?? ('cause' in outcome ? outcome.cause : undefined);
				logger.error('Checkout failed', {
					// A refused session behind either push still reads as AUTH101.
					code:
						cause === undefined
							? ERROR_CODES.CHECKOUT_FAILED_CART_SAFE
							: pushFailureCode(cause, ERROR_CODES.CHECKOUT_FAILED_CART_SAFE),
					showToast: true,
					toast: { title: t('pos_cart.checkout_failed') },
					context: {
						error: outcome.reason,
						...(cause === undefined
							? {}
							: { cause: cause instanceof Error ? cause.message : String(cause) }),
					},
				});
			}
			if (outcome.kind === 'unknown')
				logger.error(t('pos_checkout.payment_unanswered'), {
					code: ERROR_CODES.PAYMENT_OUTCOME_UNKNOWN,
					showToast: true,
					context: {
						orderId: paymentOrder.id,
						paymentId: outcome.row.id,
						amount: outcome.row.amount,
					},
				});
			return outcome;
		},
		[
			ctx,
			http,
			forceOffline,
			onlineStatus.status,
			wpCredentials.id,
			store,
			storeCurrency,
			storeDecimals,
			stampCompletion,
			manager,
			storeDB,
			t,
		]
	);
}
