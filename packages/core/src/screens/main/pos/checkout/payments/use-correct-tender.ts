import * as React from 'react';

import { useOnlineStatus } from '@wcpos/hooks/use-online-status';
import type { OrderPaymentSummary, PaymentRow } from '@wcpos/order-math';
import { moneyCommandPoster, useQueryRuntime } from '@wcpos/query';
import type { EngineRecord } from '@wcpos/query';
import { isDefinitiveMoneyRefusal, moneyRefusalOf } from '@wcpos/sync-core';
import { getErrorMessage, getLogger } from '@wcpos/utils/logger';

import { useStoreSession } from '../../../../../contexts/app-state';
import { useT } from '../../../../../contexts/translations';
import { usePaymentMethods } from '../../../hooks/use-payment-methods';
import { useRestHttpClient } from '../../../hooks/use-rest-http-client';

const logger = getLogger(['wcpos', 'pos', 'checkout', 'payments', 'correct']);

type T = ReturnType<typeof useT>;
/** The store's refusal table (#3647), one string per `data.reason`; literal keys for extraction. */
const REASONS = new Map<string, (t: T, data: Record<string, unknown>) => string>([
	['not_captured', (t) => t('orders.change_tender_not_captured')],
	['voidable', (t) => t('orders.change_tender_voidable')],
	['is_reversal', (t) => t('orders.change_tender_is_reversal')],
	['already_corrected', (t) => t('orders.change_tender_already_corrected')],
	['refunded', (t) => t('orders.change_tender_refunded')],
	['provider_row', (t) => t('orders.change_tender_provider_row')],
	['method_invalid', (t) => t('orders.change_tender_method_invalid')],
	['same_method', (t) => t('orders.change_tender_same_method')],
	[
		'off_rounding_increment',
		(t, { increment, amount }) => t('orders.change_tender_off_increment', { increment, amount }),
	],
]);

/**
 * What the cashier is told when `correct` did not answer. Only the store's own decision is a
 * refusal; anything else may have landed, and a replay under the same `command_id` is safe, so
 * it is never "failed, try again".
 */
export function correctionFailureMessage(
	error: unknown,
	t: T
): { refused: boolean; message: string } {
	const refusal = moneyRefusalOf(error);
	if (!isDefinitiveMoneyRefusal(refusal))
		return { refused: false, message: t('orders.change_tender_unknown') };
	if (refusal?.code === 'wcpos_tender_correction_unavailable')
		return { refused: true, message: t('orders.change_tender_unavailable') };
	const data = refusal?.data ?? {};
	const message = REASONS.get(String(data.reason))?.(t, data) ?? refusal?.message;
	return { refused: true, message: message || t('orders.change_tender_unknown') };
}

/**
 * Change a captured manual leg's tender: one `correct` money command through the poster (which
 * adds `command_id` and `revision`). Only the answer's order summary is mirrored, never R+: the
 * settle's pull brings R- and R+ together, so the ledger never holds R+ alone. Online only, and
 * only for an order the store has; never journaled for later.
 */
export function useCorrectTender(): (
	order: EngineRecord<'orders'>,
	paymentId: string,
	method: { id: string; title: string }
) => Promise<'done' | 'refused' | 'unconfirmed'> {
	const t = useT();
	const http = useRestHttpClient();
	const onlineStatus = useOnlineStatus();
	const manager = useQueryRuntime();
	const { storeDB } = useStoreSession();
	const { methods } = usePaymentMethods();

	return React.useCallback(
		async (order, paymentId, method) => {
			const orderId = (order.getLatest?.().payload ?? order.payload).id;
			const context = { orderUUID: order.uuid, orderId, paymentId, method: method.id };
			if (onlineStatus.status !== 'online-website-available' || !orderId) {
				logger.warn(t('orders.change_tender_offline'), { showToast: true, context });
				return 'refused';
			}
			const post = moneyCommandPoster({
				runtime: manager,
				storeDB,
				orderUuid: order.uuid,
				post: (url, body) => http.post(url, body),
			});
			try {
				const response = await post(`orders/${orderId}/payments/${paymentId}/correct`, {
					method_id: method.id,
				});
				const answer = response.data as { payment: PaymentRow; order: OrderPaymentSummary };
				// The store has changed the money: a failed mirror stays journaled and the pull fixes it.
				await post.mirror({ order: answer.order }).catch((error: unknown) =>
					logger.warn('Tender correction answered but not mirrored', {
						context: { ...context, error: getErrorMessage(error) },
					})
				);
				// A re-press re-sends the journaled first pick: the answer names the method that took it.
				const answered = answer.payment?.method_id ?? method.id;
				const title = methods.find(({ id }) => id === answered)?.title ?? answered;
				logger.success(t('orders.change_tender_done', { method: title }), {
					showToast: true,
					context,
				});
				return 'done';
			} catch (error) {
				const { refused, message } = correctionFailureMessage(error, t);
				// No code: its summary and action hint would replace these sentences in the toast.
				logger.warn(message, {
					toast: { title: refused ? message : t('orders.change_tender_unconfirmed') },
					showToast: true,
					context: { ...context, error: getErrorMessage(error) },
				});
				return refused ? 'refused' : 'unconfirmed';
			} finally {
				// A refusal settles too: its corrective refresh brings what the store holds.
				await post.settle().catch(() => undefined);
			}
		},
		[http, onlineStatus.status, manager, storeDB, t, methods]
	);
}
