import * as React from 'react';

import { useObservableSuspense } from 'observable-hooks';

import useNewOrder from './use-new-order';
import useOrders from '../../../contexts/orders';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CurrentOrderContextProps {
	currentOrder: OrderDocument;
}

export const CurrentOrderContext = React.createContext<CurrentOrderContextProps>(null);

interface CurrentOrderContextProviderProps {
	children: React.ReactNode;
	orderID?: string;
}

/**
 * Provider the active order by uuid, or a new order
 */
const CurrentOrderProvider = ({ children, orderID }: CurrentOrderContextProviderProps) => {
	const { resource } = useOrders();
	const orders = useObservableSuspense(resource);
	const newOrder = useNewOrder();

	// const defaultCustomerID = store.default_customer_is_cashier
	// 	? wpCredentials.id
	// 	: store.default_customer;

	let currentOrder = orders.find((order) => order.uuid === orderID);
	if (!currentOrder) {
		currentOrder = newOrder;
	}

	/**
	 *
	 */
	return (
		<CurrentOrderContext.Provider value={{ currentOrder }}>{children}</CurrentOrderContext.Provider>
	);
};

export default CurrentOrderProvider;
