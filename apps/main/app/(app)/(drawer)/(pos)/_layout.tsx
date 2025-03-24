import React from 'react';
import { useWindowDimensions } from 'react-native';

import {
	Redirect,
	useSegments,
	Slot,
	Stack,
	useLocalSearchParams,
	useGlobalSearchParams,
} from 'expo-router';
import { useObservableEagerState, ObservableResource } from 'observable-hooks';
import { map, distinctUntilChanged } from 'rxjs/operators';

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

const POSStack = () => {
	const { currentOrder } = useCurrentOrder();

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
				screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}
			>
				<Stack.Screen name="index" />
				<Stack.Screen
					name="(modals)/cart/[orderId]/checkout"
					options={{
						presentation: 'modal',
					}}
				/>
				<Stack.Screen
					name="(modals)/cart/receipt/[orderId]"
					options={{
						presentation: 'modal',
					}}
				/>
			</Stack>
		</TaxRatesProvider>
	);
};

export default function POSLayout() {
	const { wpCredentials, store } = useAppState();
	const cashierID = useObservableEagerState(wpCredentials.id$);
	const storeID = useObservableEagerState(store.id$);
	const { collection: ordersCollection } = useCollection('orders');
	const { orderId } = useGlobalSearchParams<{ orderId: string }>();
	console.log('global params orderId', orderId);

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
