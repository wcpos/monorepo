import * as React from 'react';

import { useRouter } from 'expo-router';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import Platform from '@wcpos/utils/platform';

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
	 * Update the current order without causing a full navigation/remount.
	 * On web, we manually update the URL to keep nice URLs like /cart/uuid
	 */
	const setCurrentOrderID = React.useCallback(
		(orderId: string) => {
			// Use setParams to avoid remounting the screen
			router.setParams({ orderId: orderId || undefined });

			// On web, update the browser URL for nice URLs
			// Run after setParams completes to override the query param URL
			if (Platform.isWeb) {
				requestAnimationFrame(() => {
					const newPath = orderId ? `/cart/${orderId}` : '/cart';
					window.history.replaceState(null, '', newPath);
				});
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
