import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import { useT } from '../../../../contexts/translations';
import useCurrencyFormat from '../../hooks/use-currency-format';

const CartTabTitle = ({ focused, order }: { focused: boolean; order: any }) => {
	const total = useObservableState(order.total$, order.total);
	const { format } = useCurrencyFormat();
	const t = useT();

	return (
		<Text type={focused ? 'inverse' : 'primary'}>
			{t('Cart {order_total}', { order_total: format(total || 0), _tags: 'core' })}
		</Text>
	);
};

export default CartTabTitle;
