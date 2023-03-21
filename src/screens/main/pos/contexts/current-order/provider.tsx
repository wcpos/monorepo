import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import get from 'lodash/get';
import { ObservableResource, useObservable, useObservableSuspense } from 'observable-hooks';
import { Observable } from 'rxjs';
import { map, tap, switchMap } from 'rxjs/operators';

import NewOrder from './new-order';
import useLocalData from '../../../../../contexts/local-data';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CurrentOrderContextProps {
	currentOrder: OrderDocument | typeof NewOrder;
	setCurrentOrder: React.Dispatch<React.SetStateAction<OrderDocument | null>>;
	// newOrder: typeof NewOrder;
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
const CurrentOrderProvider = ({
	children,
	currentOrderResource,
}: CurrentOrderContextProviderProps) => {
	// const navigation = useNavigation();
	const { store, storeDB } = useLocalData();
	const collection = storeDB?.collections.orders;
	const storedOrder = useObservableSuspense(currentOrderResource);
	const [currentOrder, setCurrentOrder] = React.useState<OrderDocument | null>(storedOrder);

	/**
	 *
	 */
	const newOrder = React.useMemo(() => {
		return new NewOrder({
			collection,
			currency: store?.currency,
			currency_symbol: store?.currency_symbol,
		});
	}, [collection, store?.currency, store?.currency_symbol]);

	/**
	 *
	 */
	const handleSetCurrentOrder = React.useCallback((order: OrderDocument | null) => {
		/**
		 * FIXME: I want to change the location bar and set navigation history, but not cause render
		 * I could do it manually with window.history.pushState, but I want to use react-navigation
		 */
		// navigation.setParams({ orderID: order?.uuid || '' });
		setCurrentOrder(order);
	}, []);

	/**
	 *
	 */
	return (
		<CurrentOrderContext.Provider
			value={{
				currentOrder: currentOrder ? currentOrder : newOrder,
				setCurrentOrder: handleSetCurrentOrder,
			}}
		>
			{children}
		</CurrentOrderContext.Provider>
	);
};

export default CurrentOrderProvider;
