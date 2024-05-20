import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { useNewOrder } from './use-new-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CurrentOrderContextProps {
	currentOrder: OrderDocument;
	openOrders: { id: string; document: OrderDocument }[];
	setCurrentOrderID: (id: string) => void;
}

export const CurrentOrderContext = React.createContext<CurrentOrderContextProps>(null);

interface CurrentOrderContextProviderProps {
	children: React.ReactNode;
	resource: ObservableResource<{ id: string; document: OrderDocument }[]>;
	currentOrderUUID?: string;
}

/**
 * Provider the active order by uuid, or a new order
 */
export const CurrentOrderProvider = ({
	children,
	resource,
	currentOrderUUID,
}: CurrentOrderContextProviderProps) => {
	const { newOrder } = useNewOrder();
	const openOrders = useObservableSuspense(resource);
	let currentOrder = openOrders.find((order) => order.id === currentOrderUUID)?.document;
	if (!currentOrder) {
		currentOrder = newOrder;
	}
	const navigation = useNavigation();

	/**
	 *
	 */
	const setCurrentOrderID = React.useCallback(
		(orderID: string) => {
			navigation.setParams({ orderID });
		},
		[navigation]
	);

	/**
	 *
	 */
	return (
		<CurrentOrderContext.Provider
			value={{
				currentOrder,
				openOrders,
				setCurrentOrderID,
			}}
		>
			{children}
		</CurrentOrderContext.Provider>
	);
};
