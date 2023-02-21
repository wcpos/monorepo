import * as React from 'react';

import get from 'lodash/get';
import { ObservableResource, useObservable } from 'observable-hooks';
import { map, tap, switchMap } from 'rxjs/operators';

import NewOrder from './new-order';
import useLocalData from '../../../../../contexts/local-data';

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
 *
 * TODO - need a way to currency symbol from store document
 */
const CurrentOrderProvider = ({ children, orderID }: CurrentOrderContextProviderProps) => {
	const { store, storeDB } = useLocalData();
	const collection = storeDB?.collections.orders;

	/**
	 * Subscribe to the route orderID
	 */
	const currentOrder$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				/**
				 * NOTE - we need to observe the query result because otherwise the currentOrder is stale
				 * This causes problems when trying to update the currentOrder
				 */
				// switchMap(([uuid]) => collection.findOneFix(uuid).$),
				switchMap(([uuid]) => collection.findOneFix(uuid).exec()),
				map((order) => (order ? order : new NewOrder(collection, store.currency)))
			),
		[orderID]
	);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		return {
			currentOrderResource: new ObservableResource(currentOrder$, (val) => !!val),
		};
	}, [currentOrder$]);

	return <CurrentOrderContext.Provider value={value}>{children}</CurrentOrderContext.Provider>;
};

export default CurrentOrderProvider;
