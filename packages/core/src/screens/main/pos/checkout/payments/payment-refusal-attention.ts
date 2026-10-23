import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { OrderPaymentSummary, PaymentRow } from '@wcpos/order-math';
import type { PaymentRowRefusal } from '@wcpos/sync-core';

import type { useT } from '../../../../../contexts/translations';

/**
 * The needs-attention entry for a refused row (ADR 0040 Decided 1 rule 4), as `logger.error`
 * arguments: the tender's refusal and the recovery's refusal of an offline record tell one story.
 */
export function paymentRefusalAttention(
	t: ReturnType<typeof useT>,
	facts: {
		row: PaymentRow;
		order: OrderPaymentSummary | null;
		reason: PaymentRowRefusal;
		methodTitle: string;
		orderUuid: string;
		orderId: number | null;
		orderNumber?: string;
	}
) {
	const { row, order: summary, reason } = facts;
	const number = facts.orderNumber || facts.orderUuid.slice(0, 8);
	const values = { number, amount: row.amount, method: facts.methodTitle };
	const message =
		reason === 'order_already_paid'
			? t('payments.refusal.already_paid', values)
			: summary?.balance
				? t('payments.refusal.exceeds_balance_with_balance', {
						...values,
						balance: summary.balance,
					})
				: t('payments.refusal.exceeds_balance', values);
	return [
		message,
		{
			// Two different stories with two different answers: an order already paid
			// online needs a refund, an over-payment needs the store's balance taken
			// instead. Neither is "payment handling hit an unexpected problem".
			code:
				reason === 'order_already_paid'
					? ERROR_CODES.PAYMENT_ALREADY_PAID_ONLINE
					: ERROR_CODES.PAYMENT_EXCEEDS_BALANCE,
			showToast: true,
			terminal: { operationType: 'sync.record', outcome: 'failed', operationId: row.id },
			context: {
				collection: 'orders',
				recordId: facts.orderUuid,
				direction: 'push',
				type: 'payment.refused',
				reason: message,
				refusal: reason,
				paymentId: row.id,
				orderId: facts.orderId,
				amount: row.amount,
				methodId: row.method_id,
			},
		},
	] as const;
}
