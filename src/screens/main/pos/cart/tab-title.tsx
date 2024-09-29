import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/components/src/text';

import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';

interface Props {
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
export const CartTabTitle = ({ order }: Props) => {
	const total = useObservableEagerState(order.total$);
	const currencySymbol = useObservableEagerState(order.currency_symbol$);
	const { format } = useCurrencyFormat({ currencySymbol });
	const t = useT();

	return (
		<Text>
			{t('Cart {order_total}', { order_total: format(parseFloat(total) || 0), _tags: 'core' })}
		</Text>
	);
};
