import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/text';

import { useT } from '../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';
import { getNetPaymentTotal } from '../../cart/utils/get-net-payment-total';

interface CheckoutTitleProps {
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
export function CheckoutTitle({ order }: CheckoutTitleProps) {
	const currencySymbol = useObservableEagerState(order.currency_symbol$!);
	const total = useObservableEagerState(order.total$!);
	const refunds = useObservableEagerState(order.refunds$!);
	const { format } = useCurrencyFormat({ currencySymbol: currencySymbol ?? '' });
	const t = useT();

	if (!order) {
		throw new Error('Order not found');
	}

	const displayTotal = getNetPaymentTotal(total, refunds);

	return (
		<Text className="text-center text-lg font-bold">
			{t('pos_checkout.amount_to_pay')}
			{`: ${format(displayTotal || 0)}`}
		</Text>
	);
}
