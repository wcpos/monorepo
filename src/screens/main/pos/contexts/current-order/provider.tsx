import * as React from 'react';

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
	const { data: orders } = useOrders();
	const newOrder = useNewOrder();

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
