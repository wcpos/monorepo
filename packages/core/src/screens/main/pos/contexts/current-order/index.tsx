import * as React from 'react';

import { useRouter } from 'expo-router';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { wrapEngineDocument } from '@wcpos/query';
import { Platform } from '@wcpos/utils/platform';

import {
	type CurrentOrderActions,
	CurrentOrderActionsContext,
	CurrentOrderContext,
	type CurrentOrderContextProps,
} from './context';
import { useNewOrder } from './use-new-order';

export { useOpenOrdersResource } from './use-open-orders-resource';
export {
	CurrentOrderActionsContext,
	CurrentOrderContext,
	useCurrentOrder,
	useCurrentOrderActions,
	useCurrentOrderOptional,
	type CurrentOrderActions,
	type CurrentOrderContextProps,
} from './context';

type OrderDocument = import('@wcpos/database').OrderDocument;

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

	// Determine current order from internal state. The temporary order is engine-shaped
	// since ADR 0028 stage I, so BOTH branches of the union now present the same legacy
	// face through the same wrapper (the proxy passes the temp doc's `.isNew` through);
	// mutation paths resolve the raw temp document via the temp-order repository, never
	// through this context value.
	const currentOrder = (openOrders.find((order) => order.id === internalOrderId)?.document ??
		wrapEngineDocument('orders', newOrder as never)) as OrderDocument;

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
	 * Kept current so `getCurrentOrder()` can resolve the order at event time without anyone
	 * having to subscribe to it.
	 *
	 * Updated in a LAYOUT effect — react-compiler forbids touching a ref while rendering,
	 * and the write must be commit-synchronous: subscription callbacks (e.g. the hardware
	 * barcode scan) can fire after the commit that switched orders but before passive
	 * effects flush, and a passive-effect write would hand them the previous order (#1294).
	 */
	const currentOrderRef = React.useRef(currentOrder);
	React.useLayoutEffect(() => {
		currentOrderRef.current = currentOrder;
	}, [currentOrder]);

	/**
	 * Stable for the provider's lifetime — `setCurrentOrderID` is a useCallback on the router
	 * and the getter closes over a ref. Anything that only mutates the order can subscribe
	 * here and never re-render on a cart write.
	 */
	const actions = React.useMemo<CurrentOrderActions>(
		() => ({
			getCurrentOrder: () => currentOrderRef.current,
			setCurrentOrderID,
		}),
		[setCurrentOrderID]
	);

	return (
		<CurrentOrderActionsContext.Provider value={actions}>
			<CurrentOrderContext.Provider
				value={{
					currentOrder,
					openOrders,
					setCurrentOrderID,
				}}
			>
				{children}
			</CurrentOrderContext.Provider>
		</CurrentOrderActionsContext.Provider>
	);
}
