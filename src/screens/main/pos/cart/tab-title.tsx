import * as React from 'react';

import { useObservableEagerState } from 'observable-hooks';

import { Text } from '@wcpos/tailwind/src/text';

import { useT } from '../../../../contexts/translations';
import { useCurrentOrderCurrencyFormat } from '../../hooks/use-current-order-currency-format';

interface Props {
	focused: boolean;
	order: import('@wcpos/database').OrderDocument;
}

/**
 *
 */
const CartTabTitle = ({ focused, order }: Props) => {
	const total = useObservableEagerState(order.total$);
	const { format } = useCurrentOrderCurrencyFormat();
	const t = useT();

	return (
		<Text className={`text-${focused ? 'inverse' : 'primary'}`}>
			{t('Cart {order_total}', { order_total: format(total || 0), _tags: 'core' })}
		</Text>
	);
};

export default CartTabTitle;
