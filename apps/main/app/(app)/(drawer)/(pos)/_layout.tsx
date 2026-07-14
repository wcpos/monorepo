import React from 'react';
import { View } from 'react-native';

import { Stack, useGlobalSearchParams, useSegments } from 'expo-router';
import { useObservableEagerState } from 'observable-hooks';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { PortalHost } from '@wcpos/components/portal';
import { Suspense } from '@wcpos/components/suspense';
import { useAppState } from '@wcpos/core/contexts/app-state';
import { TaxRatesProvider } from '@wcpos/core/screens/main/contexts/tax-rates';
import {
	CurrentOrderProvider,
	useCurrentOrder,
	useOpenOrdersResource,
} from '@wcpos/core/screens/main/pos/contexts/current-order';
import { useQuery } from '@wcpos/query';

import { useNavigationBackground } from '../../../../components/use-navigation-background';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'index',
};

export default function POSLayout() {
	const { wpCredentials, store } = useAppState();
	const cashierID = useObservableEagerState(wpCredentials.id$);
	const storeID = useObservableEagerState(store.id$);
	const segments = useSegments();
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

	return (
		<Suspense>
			<CurrentOrderProvider resource={resource} currentOrderUUID={orderId}>
				<ErrorBoundary>
					<Suspense>
						<POSStack />
					</Suspense>
				</ErrorBoundary>
			</CurrentOrderProvider>
		</Suspense>
	);
}

function POSStack() {
	const screenBackgroundColor = useNavigationBackground();
	const { currentOrder } = useCurrentOrder();

	/**
	 *
	 */
	const taxQuery = useQuery({
		queryKeys: ['tax-rates'],
		collectionName: 'taxes',
	});

	return (
		<TaxRatesProvider taxQuery={taxQuery!} order={currentOrder}>
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
