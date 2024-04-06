import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import { useT } from '../../../../contexts/translations';
import { useCurrencyFormat } from '../../hooks/use-currency-format';

interface Props {
	focused: boolean;
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
const CartTabTitle = ({ focused, order }: Props) => {
	const total = useObservableEagerState(order?.total$);
	const currencySymbol = useObservableEagerState(order?.currency_symbol$);
	const { format } = useCurrencyFormat({ currencySymbol });
	const t = useT();

	return (
		<Text type={focused ? 'inverse' : 'primary'}>
			{t('Cart {order_total}', { order_total: format(total || 0), _tags: 'core' })}
		</Text>
	);
};

export default CartTabTitle;
