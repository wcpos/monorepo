import * as React from 'react';

import { Text } from '@wcpos/components/text';
import { getNetPaymentTotal } from '@wcpos/order-math';
import { useRecordField } from '@wcpos/query';

import { useT } from '../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';

interface CheckoutTitleProps {
	order: import('../../contexts/current-order').CurrentOrderRecord;
}

/**
 * The order's net payment total, formatted: what the cashier is about to charge.
 */
export function useAmountToPay(order: CheckoutTitleProps['order']): string {
	const currencySymbol = useRecordField(order, (record) => record.payload.currency_symbol);
	const total = useRecordField(order, (record) => record.payload.total);
	const refunds = useRecordField(order, (record) => record.payload.refunds);
	const { format } = useCurrencyFormat({ currencySymbol: currencySymbol ?? '' });

	return format(getNetPaymentTotal(total, refunds) || 0);
}

/**
 *
 */
export function CheckoutTitle({ order }: CheckoutTitleProps) {
	const amount = useAmountToPay(order);
	const t = useT();

	if (!order) {
		throw new Error('Order not found');
	}

	return (
		<Text testID="checkout-amount-to-pay" className="text-center text-lg font-bold">
			{t('pos_checkout.amount_to_pay')}
			{`: ${amount}`}
		</Text>
	);
}
