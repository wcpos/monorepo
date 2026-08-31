import React from 'react';
import { View } from 'react-native';

import { Stack, useGlobalSearchParams, useSegments } from 'expo-router';

import { useDocField } from '@wcpos/query';
import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { PortalHost } from '@wcpos/components/portal';
import { Suspense } from '@wcpos/components/suspense';
import { useStoreSession } from '@wcpos/core/contexts/app-state';
import { TaxRatesProvider } from '@wcpos/core/screens/main/contexts/tax-rates';
import { useDefaultCustomer } from '@wcpos/core/screens/main/hooks/use-default-customer';
import {
	CurrentOrderProvider,
	useOpenOrdersResource,
} from '@wcpos/core/screens/main/pos/contexts/current-order';
import { OrderEngineWarningsProvider } from '@wcpos/core/screens/main/pos/contexts/order-engine-warnings';
import { OrderMoneyDivergenceProvider } from '@wcpos/core/screens/main/pos/contexts/order-money-divergence';

import { useNavigationBackground } from '../../../../components/use-navigation-background';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'index',
};

export default function POSLayout() {
	const { wpCredentials, store } = useStoreSession();
	const cashierID = useDocField(wpCredentials, (value) => value.id) as number | undefined;
	const storeID = useDocField(store, (value) => value.id) as number | undefined;
	const segments: string[] = useSegments();
	// Handle catch-all route param - [...orderId] returns an array (could be empty array for /cart)
	const params = useGlobalSearchParams<{ orderId: string | string[] }>();

	// Extract orderId: handle array (catch-all) vs string, and handle empty array
	let orderIdFromParams: string | undefined;
	if (Array.isArray(params.orderId)) {
		// Catch-all route: empty array means /cart (new order), non-empty means /cart/uuid
		orderIdFromParams = params.orderId.length > 0 ? params.orderId[0] : undefined;
	} else {
		orderIdFromParams = params.orderId;
	}

	// Check if we're currently in the POS route structure
	const isInPOSRoute = segments.includes('(pos)');

	// Check if we're at a /cart route (with or without orderId)
	const isAtCartRoute = segments.includes('cart');

	// Remember the last valid orderId when at a cart route with an orderId.
	// This prevents losing the orderId when a modal (like settings) is opened, which
	// navigates away from the POS routes. We only remember when explicitly at a cart
	// route with an orderId so that /cart (new order) still shows a new order.
	//
	// This uses React's "adjusting state during render" pattern: when a new candidate
	// orderId is observed we store it immediately during render (no effect, no ref), so
	// the value survives the transition out of the POS routes when a modal opens.
	const [lastOrderId, setLastOrderId] = React.useState<string | undefined>(undefined);
	if (isInPOSRoute && isAtCartRoute && orderIdFromParams && orderIdFromParams !== lastOrderId) {
		setLastOrderId(orderIdFromParams);
	}

	// Use the route param if in POS, otherwise use the remembered value (for modals)
	const orderId = isInPOSRoute ? orderIdFromParams : lastOrderId;

	/**
	 * We then need to filter the open orders to limit by cashier and store
	 *
	 * @TODO - it would be nice to be able to query ($elemMatch) by cashier and store, but
	 * there are too many edge cases, ie: cashier is not set, store is not set, etc.
	 * For now, we'll just filter the results.
	 */
	const resource = useOpenOrdersResource(cashierID, storeID);

	// Built HERE, above the Suspense below, and handed to the provider — the same shape as the
	// open-orders resource above it and for the same reason: a resource built inside the
	// boundary that suspends on it is discarded with the aborted render and rebuilt by every
	// retry, which never ends (#1707). This layout commits alongside the fallback, so the retry
	// reads back the resource the first attempt already subscribed.
	const { defaultCustomerResource } = useDefaultCustomer();

	// The divergence store sits OUTSIDE the Suspense boundary, deliberately (R1).
	// A save-time money divergence can be acked for an order in a background tab,
	// or while the cart screen is unmounted on a small layout — so the
	// subscription has to outlive them, and the store is keyed by order uuid so
	// the alert surfaces on the tab it belongs to. It must also outlive the
	// BOUNDARY itself: while CurrentOrderProvider suspends on its open-orders
	// resource React never commits effects inside that boundary, and
	// `engine.events()` does not replay, so a drain landing during the initial
	// load would be missed for good.
	//
	// The engine-warning store (#1560) sits beside it for the narrower half of the
	// same reason: the cart's banner and the checkout modal's are two mounts of one
	// notice, so the store has to outlive both. It does NOT need to outlive the
	// BOUNDARY — nothing pushes into it from outside React; every entry comes from
	// an engine call a cart hook just made, below this point.
	return (
		<OrderMoneyDivergenceProvider>
			<OrderEngineWarningsProvider>
				<Suspense>
					<CurrentOrderProvider
						resource={resource}
						defaultCustomerResource={defaultCustomerResource}
						currentOrderUUID={orderId}
					>
						<ErrorBoundary>
							<Suspense>
								<POSStack />
							</Suspense>
						</ErrorBoundary>
					</CurrentOrderProvider>
				</Suspense>
			</OrderEngineWarningsProvider>
		</OrderMoneyDivergenceProvider>
	);
}

/**
 * Deliberately does NOT subscribe to the current order.
 *
 * It used to call `useCurrentOrder()` purely to pass the order down to `TaxRatesProvider`.
 * That put a cart-write subscription ABOVE the navigator, so every add/remove re-rendered
 * this component and the whole `<Stack>` subtree with it — measured at `ProductTile` ×80 per
 * cart mutation. `TaxRatesProvider` now subscribes to the order itself, below this point.
 */
function POSStack() {
	const screenBackgroundColor = useNavigationBackground();

	return (
		<TaxRatesProvider>
			<View className="bg-background flex-1">
				<Stack
					screenOptions={{
						animation: 'none',
						headerShown: false,
						contentStyle: { backgroundColor: screenBackgroundColor },
					}}
				>
					<Stack.Screen name="index" />
					<Stack.Screen
						name="(modals)/cart/[orderId]/checkout"
						options={{
							presentation: 'containedTransparentModal',
							animation: 'fade',
							contentStyle: { backgroundColor: 'transparent' },
						}}
					/>
					<Stack.Screen
						name="(modals)/cart/receipt/[orderId]"
						options={{
							presentation: 'containedTransparentModal',
							animation: 'fade',
							contentStyle: { backgroundColor: 'transparent' },
						}}
					/>
				</Stack>
			</View>
			{/**
			 * We need to have the named PortalHost inside the CurrentOrderProvider and TaxRatesProvider
			 * so that dialogs like add/edit product etc can access the context
			 */}
			<ErrorBoundary>
				<PortalHost name="pos" />
			</ErrorBoundary>
		</TaxRatesProvider>
	);
}
