import * as React from 'react';

import { useRoute } from '@react-navigation/native';
import get from 'lodash/get';
import { ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { Subject } from 'rxjs';
import { tap } from 'rxjs/operators';

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
}

const currentOrder$ = new Subject<OrderDocument | typeof NewOrder>();
const currentOrderResource = new ObservableResource(currentOrder$, (val) => !!val);

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
	currentOrder$.next(null); // bit of a hack to suspend the compnents waiting for updated order
	collection
		.findOneFix(orderID)
		.exec()
		.then((order) => {
			if (order) {
				currentOrder$.next(order);
			} else {
				currentOrder$.next(new NewOrder(collection));
			}
		});

	/**
	 *
	 */
	const value = React.useMemo(() => {
		return {
			currentOrderResource,
		};
	}, []);

	return <CurrentOrderContext.Provider value={value}>{children}</CurrentOrderContext.Provider>;
};

export default CurrentOrderProvider;
