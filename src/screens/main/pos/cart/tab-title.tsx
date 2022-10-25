import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/components/src/text';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';
import { t } from '@wcpos/core/src/lib/translations';

const CartTabTitle = ({ focused, order }: { focused: boolean; order: any }) => {
	const total = useObservableState(order.total$, order.total);
	const { format } = useCurrencyFormat();

	return (
		<Text type={focused ? 'inverse' : 'primary'}>
			{t('Cart {order_total}', { order_total: format(total || 0) })}
		</Text>
	);
};

export default CartTabTitle;
