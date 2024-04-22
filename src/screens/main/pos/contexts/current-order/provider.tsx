import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { useNewOrder } from './use-new-order';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CurrentOrderContextProps {
	currentOrder: OrderDocument;
	setCurrentOrderID: (id: string) => void;
}

export const CurrentOrderContext = React.createContext<CurrentOrderContextProps>(null);

interface CurrentOrderContextProviderProps {
	children: React.ReactNode;
	resource: ObservableResource<OrderDocument | null>;
}

/**
 * Provider the active order by uuid, or a new order
 */
export const CurrentOrderProvider = ({ children, resource }: CurrentOrderContextProviderProps) => {
	const { newOrder } = useNewOrder();
	const currentOrder = useObservableSuspense(resource) ?? newOrder;
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
				setCurrentOrderID,
			}}
		>
			{children}
		</CurrentOrderContext.Provider>
	);
};
