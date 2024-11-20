import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/src/text';

import { useT } from '../../../../../contexts/translations';
import { useCurrencyFormat } from '../../../hooks/use-currency-format';

interface CheckoutTitleProps {
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
const CheckoutTitle = ({ order }: CheckoutTitleProps) => {
	const currencySymbol = useObservableEagerState(order.currency_symbol$);
	const total = useObservableEagerState(order.total$);
	const { format } = useCurrencyFormat({ currencySymbol });
	const t = useT();

	if (!order) {
		throw new Error('Order not found');
	}

	return (
		<Text className="text-lg font-bold text-center">
			{t('Amount to Pay', { _tags: 'core' })}
			{`: ${format(total || 0)}`}
		</Text>
	);
};

export default CheckoutTitle;
