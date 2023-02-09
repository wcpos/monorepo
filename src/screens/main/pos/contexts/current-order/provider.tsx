import * as React from 'react';

import { useRoute } from '@react-navigation/native';
import get from 'lodash/get';
import { ObservableResource, useObservable } from 'observable-hooks';
import { map, tap, switchMap } from 'rxjs/operators';

import NewOrder from './new-order';
import useStore from '../../../../../contexts/store';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CurrentOrderContextProps {
	currentOrderResource: ObservableResource<OrderDocument | typeof NewOrder>;
	// setCurrentOrder: React.Dispatch<React.SetStateAction<OrderDocument | undefined>>;
	// newOrder: typeof NewOrder;
}

export const CurrentOrderContext = React.createContext<CurrentOrderContextProps>(null);

interface CurrentOrderContextProviderProps {
	children: React.ReactNode;
}

/**
 * Providers the active order by uuid
 * If no orderID is provided, active order will be a new order (mock Order class)
 * Current order should be set by route only
 */
const CurrentOrderProvider = ({ children }: CurrentOrderContextProviderProps) => {
	const { storeDB } = useStore();
	const collection = storeDB?.collections.orders;
	const route = useRoute();
	const orderID = get(route, ['params', 'orderID']);

	/**
	 * Subscribe to the route orderID
	 */
	const currentOrder$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				/**
				 * @NOTE - we need to observe the query result because otherwise the currentOrder is stale
				 * This causes problems when trying to update the currentOrder
				 */
				switchMap(([uuid]) => collection.findOneFix(uuid).$),
				map((order) => (order ? order : new NewOrder(collection)))
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
