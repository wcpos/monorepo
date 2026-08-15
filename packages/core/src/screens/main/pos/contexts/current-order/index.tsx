import * as React from 'react';

import { useRouter } from 'expo-router';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Platform } from '@wcpos/utils/platform';

import { useNewOrder } from './use-new-order';

export { useOpenOrdersResource } from './use-open-orders-resource';

type OrderDocument = import('@wcpos/database').OrderDocument;

type OpenOrderHit = { id: string; document: OrderDocument };

interface CurrentOrderContextProps {
	currentOrder: OrderDocument;
	openOrders: OpenOrderHit[];
	setCurrentOrderID: (id: string) => void;
}

/**
 * The order the cashier is working on, and the way to switch. Deliberately excludes the
 * open-orders LIST: that array is rebuilt on every write to any `pos-open` order, and 31 of
 * the 33 consumers here want nothing but `currentOrder`.
 *
 * This split only became worth making once document identity was preserved across query
 * emissions — before that, `currentOrder` was a fresh Proxy on every emission, so splitting
 * the list out changed nothing.
 */
interface CurrentOrderOnlyContextProps {
	currentOrder: OrderDocument;
	setCurrentOrderID: (id: string) => void;
}

const CurrentOrderOnlyContext = React.createContext<CurrentOrderOnlyContextProps>(
	null as unknown as CurrentOrderOnlyContextProps
);

/** The open-orders list. Only the tab strip needs it. */
const OpenOrdersContext = React.createContext<OpenOrderHit[]>(null as unknown as OpenOrderHit[]);

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
export function CurrentOrderProvider({
	children,
	resource,
	currentOrderUUID,
}: CurrentOrderContextProviderProps) {
	const { newOrder } = useNewOrder();
	const openOrders = useObservableSuspense(resource);
	const router = useRouter();

	// Internal state is the source of truth, initialized from route param
	const [internalOrderId, setInternalOrderId] = React.useState<string | undefined>(
		currentOrderUUID
	);

	// Sync from route param to internal state ONLY when route param has a value
	// (e.g., user navigates directly to /cart/uuid or clicks browser back).
	// Do NOT sync when currentOrderUUID is undefined - this happens when switching
	// to the Cart tab which doesn't have orderId in its URL.
	//
	// Implemented as the React "adjust state during render" pattern (tracking the
	// previous route param) instead of an effect, so it never sets state inside
	// useEffect.
	const [prevOrderUUID, setPrevOrderUUID] = React.useState(currentOrderUUID);
	if (currentOrderUUID !== prevOrderUUID) {
		setPrevOrderUUID(currentOrderUUID);
		if (currentOrderUUID !== undefined) {
			setInternalOrderId(currentOrderUUID);
		}
	}

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
			router.setParams({ orderId: orderId ? [orderId] : undefined });

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
	/**
	 * Memoised on `currentOrder`, which is now stable when the current order itself did not
	 * change — so a write to a background tab's order no longer re-renders the cart, the
	 * totals, the customer, the note, or any of the mutation hooks.
	 */
	const currentOrderValue = React.useMemo<CurrentOrderOnlyContextProps>(
		() => ({ currentOrder, setCurrentOrderID }),
		[currentOrder, setCurrentOrderID]
	);

	const combined = React.useMemo<CurrentOrderContextProps>(
		() => ({ currentOrder, openOrders, setCurrentOrderID }),
		[currentOrder, openOrders, setCurrentOrderID]
	);

	return (
		<CurrentOrderOnlyContext.Provider value={currentOrderValue}>
			<OpenOrdersContext.Provider value={openOrders}>
				<CurrentOrderContext.Provider value={combined}>{children}</CurrentOrderContext.Provider>
			</OpenOrdersContext.Provider>
		</CurrentOrderOnlyContext.Provider>
	);
}

/**
 *
 */
export const useCurrentOrder = () => {
	const context = React.useContext(CurrentOrderOnlyContext);
	if (!context) {
		throw new Error(`useCurrentOrder must be called within CurrentOrderProvider`);
	}
	return context;
};

/**
 * The open-orders list, for the tab strip. Separate from `useCurrentOrder()` so that the
 * 31 consumers that only want the current order are not re-rendered by a write to some
 * other cashier tab's order.
 */
export const useOpenOrders = () => {
	const context = React.useContext(OpenOrdersContext);
	if (!context) {
		throw new Error(`useOpenOrders must be called within CurrentOrderProvider`);
	}
	return context;
};
