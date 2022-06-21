import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import useAppState from '@wcpos/hooks/src/use-app-state';
// import Checkout from '../pos/checkout';
// import Settings from '../settings';
import Receipt from '../receipt';

const Support = () => {
	const { storeDB } = useAppState();
	const order = useObservableState(storeDB.orders.findOne({ selector: { status: 'completed' } }).$);

	return <Receipt order={order} />;
};

export default Support;
