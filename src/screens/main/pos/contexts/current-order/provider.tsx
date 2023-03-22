import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import get from 'lodash/get';
import { ObservableResource, useObservable, useObservableSuspense } from 'observable-hooks';
import { Observable } from 'rxjs';
import { map, tap, switchMap } from 'rxjs/operators';

import NewOrder from './new-order';
import useLocalData from '../../../../../contexts/local-data';
import useOrders from '../../../contexts/open-orders';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CurrentOrderContextProps {
	currentOrder: OrderDocument | typeof NewOrder;
	orderID?: string;
}

export const CurrentOrderContext = React.createContext<CurrentOrderContextProps>(null);

interface CurrentOrderContextProviderProps {
	children: React.ReactNode;
	currentOrderResource?: ObservableResource<OrderDocument | null>;
}

/**
 * Providers the active order by uuid
 * If no orderID is provided, active order will be a new order (mock Order class)
 *
 * TODO - need a way to currency symbol from store document
 */
const CurrentOrderProvider = ({ children, orderID }: CurrentOrderContextProviderProps) => {
	// const navigation = useNavigation();
	const { store, storeDB } = useLocalData();
	const collection = storeDB?.collections.orders;
	const { data: orders } = useOrders();
	const currentOrder = orders.find((order) => order.uuid === orderID);

	/**
	 *
	 */
	const newOrder = React.useMemo(() => {
		return new NewOrder({
			collection,
			currency: store?.currency,
			// currency_symbol: store?.currency_symbol,
		});
	}, [collection, store?.currency]);

	/**
	 *
	 */
	return (
		<CurrentOrderContext.Provider
			value={{
				currentOrder: currentOrder ? currentOrder : newOrder,
			}}
		>
			{children}
		</CurrentOrderContext.Provider>
	);
};

export default CurrentOrderProvider;
