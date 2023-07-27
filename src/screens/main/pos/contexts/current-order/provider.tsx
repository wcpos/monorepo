import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { useOrders } from '../../../contexts/orders';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CurrentOrderContextProps {
	currentOrder: OrderDocument;
}

export const CurrentOrderContext = React.createContext<CurrentOrderContextProps>(null);

interface CurrentOrderContextProviderProps {
	children: React.ReactNode;
	orderID?: string;
	newOrderResource: ObservableResource<OrderDocument>;
}

/**
 * Provider the active order by uuid, or a new order
 */
const CurrentOrderProvider = ({
	children,
	orderID,
	newOrderResource,
}: CurrentOrderContextProviderProps) => {
	const { resource } = useOrders();
	const orders = useObservableSuspense(resource);
	const newOrder = useObservableSuspense(newOrderResource);

	/**
	 *
	 */
	const currentOrder = React.useMemo(() => {
		const order = orders.find((order) => order.uuid === orderID);
		return order ?? newOrder;
	}, [orders, newOrder, orderID]);

	/**
	 *
	 */
	const value = React.useMemo(() => ({ currentOrder }), [currentOrder]);

	/**
	 *
	 */
	return <CurrentOrderContext.Provider value={value}>{children}</CurrentOrderContext.Provider>;
};

export default CurrentOrderProvider;
