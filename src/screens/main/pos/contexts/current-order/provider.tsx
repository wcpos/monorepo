import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { useCartHelpers } from './use-cart-helpers';

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
	newOrderResource,
	openOrdersQuery,
	orderID,
}: CurrentOrderContextProviderProps) => {
	const orders = useObservableSuspense(openOrdersQuery.resource);
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
	return (
		<CurrentOrderContext.Provider value={{ currentOrder, ...useCartHelpers(currentOrder) }}>
			{children}
		</CurrentOrderContext.Provider>
	);
};

export default CurrentOrderProvider;
