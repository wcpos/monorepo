import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { from } from 'rxjs';
import { map, tap } from 'rxjs/operators';

import NewOrder from './new-order';
import useStore from '../../../../../../contexts/store';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CurrentOrderContextProps {
	currentOrderResource: ObservableResource<OrderDocument | typeof NewOrder>;
	// setCurrentOrder: React.Dispatch<React.SetStateAction<OrderDocument | undefined>>;
	// newOrder: typeof NewOrder;
}

export const CurrentOrderContext = React.createContext<CurrentOrderContextProps>(null);

interface CurrentOrderContextProviderProps {
	children: React.ReactNode;
	orderID?: string;
}

/**
 * Providers the active order by uuid
 * If no orderID is provided, active order will be a new order (mock Order class)
 * Current order should be set by route only
 */
const CurrentOrderProvider = ({ children, orderID }: CurrentOrderContextProviderProps) => {
	const { storeDB } = useStore();
	const collection = storeDB?.collections.orders;

	/**
	 *
	 */
	const currentOrderResource = React.useMemo(
		() =>
			new ObservableResource(
				collection
					.findOneFix(orderID)
					.$.pipe(map((order) => (order ? order : new NewOrder(collection))))
			),
		[collection, orderID]
	);

	/**
	 *
	 */
	// const newOrder = React.useMemo(() => new NewOrder({ collection, setCurrentOrder }), [collection]);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		return {
			currentOrderResource,
		};
	}, [currentOrderResource]);

	return <CurrentOrderContext.Provider value={value}>{children}</CurrentOrderContext.Provider>;
};

export default CurrentOrderProvider;
