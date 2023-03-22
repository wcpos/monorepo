import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import { OrdersContext } from './provider';

export const useOrders = () => {
	const context = React.useContext(OrdersContext);
	if (!context) {
		throw new Error(`useOrders must be called within OrdersProvider`);
	}

	const data = useObservableSuspense(context.resource);
	// const deferredData = React.useDeferredValue(data);

	return { ...context, data };
};
