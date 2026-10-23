import { recordPaymentAttention, type StoreLocalDatabase } from '@wcpos/query/store-local';
import { getLogger } from '@wcpos/utils/logger';
import { ERROR_CODES } from '@wcpos/utils/logger/generated/error-codes.generated';
import type { OrderPaymentSummary, PaymentRow } from '@wcpos/order-math';
import type { PaymentRowRefusal } from '@wcpos/sync-core';

import type { useT } from '../../../../../contexts/translations';

/**
 * The needs-attention entry for a refused row (ADR 0040 Decided 1 rule 4), as `logger.error`
 * arguments: the tender's refusal and the recovery's refusal of an offline record tell one story.
 */
type RefusalFacts = {
	row: PaymentRow;
	order: OrderPaymentSummary | null;
	reason: PaymentRowRefusal;
	methodTitle: string;
	orderUuid: string;
	orderId: number | null;
	orderNumber?: string;
};

const logger = getLogger(['wcpos', 'payments']);

export function paymentRefusalAttention(t: ReturnType<typeof useT>, facts: RefusalFacts) {
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

/**
 * Keep the refusal as the Orders screen's needs-attention row (ADR 0040 Decided 1 rule 4): the
 * log row above is per session, and the story must outlive a reload until the cashier marks it
 * handled. `message` is the sentence the log got, so both tell it the same way. Never throws: the
 * toast has already told the cashier, and a failed local write must not undo the refusal's handling.
 */
export function recordRefusalAttention(
	storeDB: StoreLocalDatabase,
	{ row, reason, ...facts }: RefusalFacts,
	message: string
) {
	return recordPaymentAttention(storeDB, {
		rowId: row.id,
		orderUuid: facts.orderUuid,
		orderId: facts.orderId,
		orderNumber: facts.orderNumber || null,
		amount: row.amount,
		currency: row.currency,
		methodId: row.method_id,
		methodTitle: facts.methodTitle,
		reason,
		message,
	}).catch((error: unknown) =>
		logger.warn('Could not keep a refused payment for Orders', {
			context: { paymentId: row.id, error: error instanceof Error ? error.message : String(error) },
		})
	);
}
