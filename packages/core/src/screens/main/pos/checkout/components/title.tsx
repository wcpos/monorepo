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
 *
 */
export function CheckoutTitle({ order }: CheckoutTitleProps) {
	const currencySymbol = useRecordField(order, (record) => record.payload.currency_symbol);
	const total = useRecordField(order, (record) => record.payload.total);
	const refunds = useRecordField(order, (record) => record.payload.refunds);
	const { format } = useCurrencyFormat({ currencySymbol: currencySymbol ?? '' });
	const t = useT();

	if (!order) {
		throw new Error('Order not found');
	}

	const displayTotal = getNetPaymentTotal(total, refunds);

	return (
		<Text testID="checkout-amount-to-pay" className="text-center text-lg font-bold">
			{t('pos_checkout.amount_to_pay')}
			{`: ${format(displayTotal || 0)}`}
		</Text>
	);
}
