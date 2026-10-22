import * as React from 'react';

import { useRouter } from 'expo-router';

import { type QueryHandle, type QueryResult, useRecordField } from '@wcpos/query';
import { useQuerySnapshot } from '@wcpos/query/query-state';

import {
	getCheckoutModeSnapshot,
	isReceiptStage,
	subscribeCheckoutMode,
} from '../../checkout/checkout-mode';
import {
	type CurrentOrderActions,
	CurrentOrderActionsContext,
	CurrentOrderContext,
	type OpenOrderHit,
} from './context';
import { useNewOrder } from './use-new-order';

import type { DefaultCustomerResource } from './use-new-order';

export { useOpenOrdersHandle } from './use-open-orders-handle';
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
	/** Owned by `(pos)/_layout.tsx`, above this boundary — see `useOpenOrdersHandle`. */
	handle: QueryHandle<QueryResult>;
	/** Whose open orders `handle` holds; see `CurrentOrderContextProps.openOrdersScope`. */
	scope: string;
	/** Built by `(pos)/_layout.tsx`, above this boundary — see `useNewOrder`. */
	defaultCustomerResource: DefaultCustomerResource;
	currentOrderUUID?: string;
}

function inFlightFor(id: string | undefined) {
	const mode = getCheckoutModeSnapshot();
	if (!id) return 'none';
	return mode.receiptOrders.has(id) ? 'receipt' : mode.checkoutOrders.has(id) ? 'checkout' : 'none';
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
	handle,
	scope,
	defaultCustomerResource,
	currentOrderUUID,
}: CurrentOrderContextProviderProps) {
	const { newOrder } = useNewOrder(defaultCustomerResource);
	const { hits } = useQuerySnapshot(handle, ['hits']);
	const openOrders = hits as OpenOrderHit[];
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
	//
	// A route param that merely ECHOES an id this provider has already left is not a
	// navigation: `router.setParams({ orderId: undefined })` cannot empty the
	// `[...orderId]` catch-all, so picking the "new order" tab leaves `/cart/<previous
	// uuid>` in the route. On a phone the Products and Cart tabs are two focused routes,
	// so every Products -> Cart round trip re-delivers that id — and adopting it silently
	// puts the cart, and the `getCurrentOrderRecord()` every product tile writes through,
	// back on the order the cashier just left.
	//
	// Exactly one id is parked, and only the ROUTE releases it: the mark is dropped when
	// the route delivers a DIFFERENT order (below), or when the cashier selects the parked
	// order again (in `setCurrentOrderID`). Persisting a new order must NOT release it —
	// that `setParams` lands on whichever route is focused, which during an add from the
	// Products tab is not the cart's, so the cart route still holds the parked id.
	const routeOrderUUIDRef = React.useRef(currentOrderUUID);
	const [supersededRouteOrderUUID, setSupersededRouteOrderUUID] = React.useState<
		string | undefined
	>(undefined);
	const [prevOrderUUID, setPrevOrderUUID] = React.useState(currentOrderUUID);
	if (currentOrderUUID !== prevOrderUUID) {
		setPrevOrderUUID(currentOrderUUID);
		if (currentOrderUUID !== undefined && currentOrderUUID !== supersededRouteOrderUUID) {
			setInternalOrderId(currentOrderUUID);
			if (supersededRouteOrderUUID !== undefined) {
				setSupersededRouteOrderUUID(undefined);
			}
		}
	}

	// Determine the current record from internal state. The temporary order has the same
	// engine-shaped record face as resident orders since ADR 0028 stage I.
	const selectedOrder = openOrders.find((order) => order.id === internalOrderId);
	const [held, setHeld] = React.useState<OpenOrderHit | undefined>(undefined);
	// Subscribe only to this order's membership, not keypad/tender-plan updates.
	const membership = () => inFlightFor(internalOrderId);
	React.useSyncExternalStore(subscribeCheckoutMode, membership, membership);
	const heldStatus = useRecordField(held?.record, (order) => order.payload.status);
	// Decide from the latest document: the subscribed status can lag the hits by one emission.
	const latestHeldStatus = held?.record.getLatest?.().payload.status ?? heldStatus;
	const keepHeld =
		held &&
		held.id === internalOrderId &&
		isReceiptStage(held.id, getCheckoutModeSnapshot(), latestHeldStatus);
	if (selectedOrder && held !== selectedOrder) {
		setHeld(selectedOrder);
	} else if (!selectedOrder && held && !keepHeld) {
		setHeld(undefined);
	}
	const heldRecord = !selectedOrder && keepHeld ? held.record : undefined;
	const currentOrderRecord = selectedOrder?.record ?? heldRecord ?? newOrder;
	// The displayed and writable orders differ only while a paid sale is finishing;
	// a scan then starts the next sale.
	const writableOrderRecord = selectedOrder?.record ?? newOrder;

	/**
	 * Update the current order without causing a full navigation/remount.
	 * Updates internal state immediately (source of truth) and syncs to URL.
	 */
	const setCurrentOrderID = React.useCallback(
		(orderId: string) => {
			// Update internal state immediately - this is the source of truth
			setInternalOrderId(orderId || undefined);

			// Leaving an order parks the id the route still holds (see the sync above).
			// Selecting the parked order again releases it; persisting a new one does not.
			setSupersededRouteOrderUUID((parked) =>
				orderId ? (orderId === parked ? undefined : parked) : routeOrderUUIDRef.current
			);

			// Also sync to URL for bookmarking/refresh/history purposes
			router.setParams({ orderId: orderId ? [orderId] : undefined });
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
	const currentOrderRecordRef = React.useRef(writableOrderRecord);
	const currentOrderIDRef = React.useRef(internalOrderId);
	React.useLayoutEffect(() => {
		currentOrderRecordRef.current = writableOrderRecord;
		currentOrderIDRef.current = internalOrderId;
	}, [writableOrderRecord, internalOrderId]);

	React.useLayoutEffect(() => {
		routeOrderUUIDRef.current = currentOrderUUID;
	}, [currentOrderUUID]);

	/**
	 * Stable for the provider's lifetime — `setCurrentOrderID` is a useCallback on the router
	 * and the getter closes over a ref. Anything that only mutates the order can subscribe
	 * here and never re-render on a cart write.
	 */
	const actions = React.useMemo<CurrentOrderActions>(
		() => ({
			getCurrentOrderRecord: () => currentOrderRecordRef.current,
			getCurrentOrderID: () => currentOrderIDRef.current,
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
					openOrdersScope: scope,
					setCurrentOrderID,
				}}
			>
				{children}
			</CurrentOrderContext.Provider>
		</CurrentOrderActionsContext.Provider>
	);
}
