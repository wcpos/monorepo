import React from 'react';

import { Stack, useGlobalSearchParams, useSegments } from 'expo-router';
import { ObservableResource, useObservableEagerState } from 'observable-hooks';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { useCSSVariable } from 'uniwind';

import { ErrorBoundary } from '@wcpos/components/error-boundary';
import { PortalHost } from '@wcpos/components/portal';
import { Suspense } from '@wcpos/components/suspense';
import { useAppState } from '@wcpos/core/contexts/app-state';
import { TaxRatesProvider } from '@wcpos/core/screens/main/contexts/tax-rates';
import { useCollection } from '@wcpos/core/screens/main/hooks/use-collection';
import {
	CurrentOrderProvider,
	useCurrentOrder,
} from '@wcpos/core/screens/main/pos/contexts/current-order';
import type { OrderDocument } from '@wcpos/database';
import { useQuery } from '@wcpos/query';

export const unstable_settings = {
	// Ensure that reloading on `/modal` keeps a back button present.
	initialRouteName: 'index',
};

export default function POSLayout() {
	const { wpCredentials, store } = useAppState();
	const cashierID = useObservableEagerState(wpCredentials.id$);
	const storeID = useObservableEagerState(store.id$);
	const { collection: ordersCollection } = useCollection('orders');
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

	// Remember the last valid orderId when in POS routes
	// This prevents losing the orderId when a modal (like settings) is opened
	// Only remember if we're NOT at a cart route - this ensures /cart (new order) works
	const lastOrderIdRef = React.useRef<string | undefined>(undefined);
	if (isInPOSRoute && !isAtCartRoute) {
		// Only preserve orderId when not explicitly at a cart route
		// This allows /cart to show a new order instead of remembered order
	} else if (isInPOSRoute && isAtCartRoute && orderIdFromParams) {
		// At cart route with an orderId - remember it
		lastOrderIdRef.current = orderIdFromParams;
	}

	// Use the route param if in POS, otherwise use the remembered value (for modals)
	const orderId = isInPOSRoute ? orderIdFromParams : lastOrderIdRef.current;

	/**
	 * We then need to filter the open orders to limit by cashier and store
	 *
	 * @TODO - it would be nice to be able to query ($elemMatch) by cashier and store, but
	 * there are too many edge cases, ie: cashier is not set, store is not set, etc.
	 * For now, we'll just filter the results.
	 */
	const resource = React.useMemo(
		() =>
			new ObservableResource(
				ordersCollection.find({ selector: { status: 'pos-open' } }).$.pipe(
					map((docs: OrderDocument[]) => {
						const filteredDocs = docs.filter((doc) => {
							const metaData = doc.meta_data;
							const _pos_user = metaData.find((item) => item.key === '_pos_user')?.value;
							const _pos_store = metaData.find((item) => item.key === '_pos_store')?.value;
							if (storeID === 0) {
								return _pos_user === String(cashierID);
							}
							return _pos_user === String(cashierID) && _pos_store === String(storeID);
						});
						const filteredAndSortedDocs = filteredDocs.sort((a, b) =>
							a.date_created_gmt.localeCompare(b.date_created_gmt)
						);
						return filteredAndSortedDocs.map((doc) => ({ id: doc.uuid, document: doc }));
					}),
					distinctUntilChanged((prev, next) => prev.length === next.length)
				)
			),
		[cashierID, ordersCollection, storeID]
	);

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
	const { currentOrder } = useCurrentOrder();
	const backgroundColor = useCSSVariable('--color-background');

	/**
	 *
	 */
	const taxQuery = useQuery({
		queryKeys: ['tax-rates'],
		collectionName: 'taxes',
	});

	return (
		<TaxRatesProvider taxQuery={taxQuery} order={currentOrder}>
			<Stack
				screenOptions={{
					animation: 'none',
					headerShown: false,
					contentStyle: { backgroundColor },
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
