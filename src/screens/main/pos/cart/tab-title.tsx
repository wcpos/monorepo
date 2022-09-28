import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/components/src/text';
import Icon from '@wcpos/components/src/icon';
import useCurrencyFormat from '@wcpos/hooks/src/use-currency-format';

const CartTabTitle = ({ focused, order }: { focused: boolean; order: any }) => {
	const total = useObservableState(order.total$, order.total);
	const { format } = useCurrencyFormat();

	if (!order?._id) {
		return <Icon name="plus" type={focused ? 'inverse' : 'primary'} />;
	}
	return <Text type={focused ? 'inverse' : 'primary'}>{`Cart ${format(total || 0)}`}</Text>;
};

export default CartTabTitle;
