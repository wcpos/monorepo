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
	newOrderResource,
	openOrderResource,
}: CurrentOrderContextProviderProps) => {
	const order = useObservableSuspense(openOrderResource);
	const newOrder = useObservableSuspense(newOrderResource);

	/**
	 *
	 */
	return (
		<CurrentOrderContext.Provider value={{ currentOrder: order ?? newOrder }}>
			{children}
		</CurrentOrderContext.Provider>
	);
};

export default CurrentOrderProvider;
