import * as React from 'react';

import { useRouter } from 'expo-router';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import { Platform } from '@wcpos/utils/platform';

import {
	type CurrentOrderActions,
	CurrentOrderActionsContext,
	CurrentOrderContext,
	type OpenOrderHit,
} from './context';
import { useNewOrder } from './use-new-order';

import type { DefaultCustomerResource } from './use-new-order';

export { useOpenOrdersResource } from './use-open-orders-resource';
export {
	CurrentOrderActionsContext,
	CurrentOrderContext,
	useCurrentOrder,
	useCurrentOrderActions,
	useCurrentOrderOptional,
	useCurrentOrderRecord,
	type CurrentOrderActions,
	type CurrentOrderContextProps,
	type CurrentOrderRecord,
	type OpenOrderHit,
} from './context';

interface CurrentOrderContextProviderProps {
	children: React.ReactNode;
	resource: ObservableResource<OpenOrderHit[]>;
	/** Built by `(pos)/_layout.tsx`, above this boundary — see `useNewOrder`. */
	defaultCustomerResource: DefaultCustomerResource;
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
	defaultCustomerResource,
	currentOrderUUID,
}: CurrentOrderContextProviderProps) {
	const { newOrder } = useNewOrder(defaultCustomerResource);
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

	// Determine the current record from internal state. The temporary order has the same
	// engine-shaped record face as resident orders since ADR 0028 stage I.
	const selectedOrder = openOrders.find((order) => order.id === internalOrderId);
	const currentOrderRecord = selectedOrder?.record ?? newOrder;

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
	 * Kept current so `getCurrentOrderRecord()` can resolve the order at event time without
	 * anyone having to subscribe to it.
	 *
	 * Updated in a LAYOUT effect — react-compiler forbids touching a ref while rendering,
	 * and the write must be commit-synchronous: subscription callbacks (e.g. the hardware
	 * barcode scan) can fire after the commit that switched orders but before passive
	 * effects flush, and a passive-effect write would hand them the previous order (#1294).
	 */
	const currentOrderRecordRef = React.useRef(currentOrderRecord);
	React.useLayoutEffect(() => {
		currentOrderRecordRef.current = currentOrderRecord;
	}, [currentOrderRecord]);

	/**
	 * Stable for the provider's lifetime — `setCurrentOrderID` is a useCallback on the router
	 * and the getter closes over a ref. Anything that only mutates the order can subscribe
	 * here and never re-render on a cart write.
	 */
	const actions = React.useMemo<CurrentOrderActions>(
		() => ({
			getCurrentOrderRecord: () => currentOrderRecordRef.current,
			setCurrentOrderID,
		}),
		[setCurrentOrderID]
	);

	return (
		<CurrentOrderActionsContext.Provider value={actions}>
			<CurrentOrderContext.Provider
				value={{
					currentOrderRecord,
					openOrders,
					setCurrentOrderID,
				}}
			>
				{children}
			</CurrentOrderContext.Provider>
		</CurrentOrderActionsContext.Provider>
	);
}
