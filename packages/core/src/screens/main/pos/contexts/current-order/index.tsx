import * as React from 'react';

import { useRouter } from 'expo-router';
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
	const router = useRouter();

	/**
	 *
	 */
	const setCurrentOrderID = React.useCallback(
		(orderId: string) => {
			if (orderId) {
				router.navigate(`/cart/${orderId}`);
			} else {
				// Navigate to /cart for new orders - this keeps us on the cart tab in tabs layout
				router.navigate('/cart');
			}
		},
		[router]
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

/**
 *
 */
export const useCurrentOrder = () => {
	const context = React.useContext(CurrentOrderContext);
	if (!context) {
		throw new Error(`useCurrentOrder must be called within CurrentOrderProvider`);
	}
	return context;
};
