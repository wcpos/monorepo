import * as React from 'react';
import { OrdersContext } from './orders-provider';

export const useOrders = () => {
	const context = React.useContext(OrdersContext);
	if (!context) {
		throw new Error(`useOrders must be called within OrdersProvider`);
	}

	return context;
};
