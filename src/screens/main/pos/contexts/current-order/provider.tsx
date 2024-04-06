import * as React from 'react';

import { useNavigation } from '@react-navigation/native';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

type OrderDocument = import('@wcpos/database').OrderDocument;

interface CurrentOrderContextProps {
	currentOrder: OrderDocument;
	setCurrentOrderID: (id: string) => void;
}

export const CurrentOrderContext = React.createContext<CurrentOrderContextProps>(null);

interface CurrentOrderContextProviderProps {
	children: React.ReactNode;
	resource: ObservableResource<OrderDocument>;
}

/**
 * Provider the active order by uuid, or a new order
 */
export const CurrentOrderProvider = ({ children, resource }: CurrentOrderContextProviderProps) => {
	const currentOrder = useObservableSuspense(resource);
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
