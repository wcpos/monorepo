import * as React from 'react';
import { useObservableSuspense } from 'observable-hooks';
import { OrdersContext } from './provider';

export const useOrders = () => {
	const context = React.useContext(OrdersContext);
	if (!context) {
		throw new Error(`useOrders must be called within OrdersContext`);
	}

	const data = useObservableSuspense(context.resource);

	return { ...context, data };
};
