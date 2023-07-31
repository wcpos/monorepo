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
	openOrderResource,
}: CurrentOrderContextProviderProps) => {
	const order = useObservableSuspense(openOrderResource);
	const newOrder = useObservableSuspense(newOrderResource);
	const currentOrder = order ?? newOrder;
	const helpers = useCartHelpers(currentOrder);

	/**
	 *
	 */
	return (
		<CurrentOrderContext.Provider value={{ currentOrder, ...helpers }}>
			{children}
		</CurrentOrderContext.Provider>
	);
};

export default CurrentOrderProvider;
