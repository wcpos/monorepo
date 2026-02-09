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

export const CurrentOrderContext = React.createContext<CurrentOrderContextProps>(
	null as unknown as CurrentOrderContextProps
);

interface CurrentOrderContextProviderProps {
	children: React.ReactNode;
	resource: ObservableResource<{ id: string; document: OrderDocument }[]>;
	currentOrderUUID?: string;
}

/**
 * Provider the active order by uuid, or a new order
 *
 * Uses internal state as the source of truth for current order, not route params.
 * This ensures the order state is shared across all tabs/views (e.g., when adding
 * a product from the Products tab in small screen mode, the Cart tab will see
 * the newly created order).
 */
export const CurrentOrderProvider = ({
	children,
	resource,
	currentOrderUUID,
}: CurrentOrderContextProviderProps) => {
	const { newOrder } = useNewOrder();
	const openOrders = useObservableSuspense(resource);
	const router = useRouter();

	// Internal state is the source of truth, initialized from route param
	const [internalOrderId, setInternalOrderId] = React.useState<string | undefined>(
		currentOrderUUID
	);

	// Sync from route param to internal state ONLY when route param has a value
	// (e.g., user navigates directly to /cart/uuid or clicks browser back)
	// Do NOT sync when currentOrderUUID is undefined - this happens when switching
	// to the Cart tab which doesn't have orderId in its URL
	React.useEffect(() => {
		// Only sync if route param has an actual value (explicit navigation to an order)
		// Ignore undefined - internal state is the source of truth
		if (currentOrderUUID !== undefined) {
			setInternalOrderId(currentOrderUUID);
		}
	}, [currentOrderUUID]);

	// Determine current order from internal state
	const currentOrder = (openOrders.find((order) => order.id === internalOrderId)?.document ??
		newOrder) as OrderDocument;

	/**
	 * Update the current order without causing a full navigation/remount.
	 * Updates internal state immediately (source of truth) and syncs to URL.
	 */
	const setCurrentOrderID = React.useCallback(
		(orderId: string) => {
			// Update internal state immediately - this is the source of truth
			setInternalOrderId(orderId || undefined);

			// Also sync to URL for bookmarking/refresh/history purposes
			router.setParams({ orderId: orderId || undefined });

			// On web, update the browser URL for nice URLs
			// Run after setParams completes to override the query param URL
			if (Platform.isWeb) {
				requestAnimationFrame(() => {
					// Get base path from homepage URL (e.g., '/foobar/' from 'https://wcpos.local/foobar/')
					const homepage = (globalThis as any).initialProps?.homepage as string | undefined;
					const basePath = homepage ? new URL(homepage).pathname.replace(/\/$/, '') : '';
					const newPath = orderId ? `${basePath}/cart/${orderId}` : `${basePath}/cart`;
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
