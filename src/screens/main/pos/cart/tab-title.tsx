import * as React from 'react';

import { useObservableState } from 'observable-hooks';

import Text from '@wcpos/components/src/text';

import useCurrencyFormat from '../../../../hooks/use-currency-format';
import { t } from '../../../../lib/translations';

const CartTabTitle = ({ focused, order }: { focused: boolean; order: any }) => {
	const total = useObservableState(order.total$, order.total);
	const { format } = useCurrencyFormat();

	return (
		<Text type={focused ? 'inverse' : 'primary'}>
			{t('Cart {order_total}', { order_total: format(total || 0), _tags: 'core' })}
		</Text>
	);
};

export default CartTabTitle;
