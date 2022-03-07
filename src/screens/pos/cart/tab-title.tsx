import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import Text from '@wcpos/common/src/components/text';
import Icon from '@wcpos/common/src/components/icon';

const CartTabTitle = ({ focused, order }: { focused: boolean; order: any }) => {
	const total = useObservableState(order.total$, order.total);

	if (!order?._id) {
		return <Icon name="plus" type={focused ? 'inverse' : 'primary'} />;
	}
	return <Text type={focused ? 'inverse' : 'primary'}>Cart: {total}</Text>;
};

export default CartTabTitle;
