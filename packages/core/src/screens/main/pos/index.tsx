import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';
import { orderBy } from '@shelf/fast-natural-order-by';
import get from 'lodash/get';
import { ObservableResource, useObservableEagerState } from 'observable-hooks';
import { distinctUntilChanged, map } from 'rxjs/operators';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';
// import { useQuery } from '@wcpos/query';

import Checkout from './checkout';
import { CurrentOrderProvider } from './contexts/current-order';
import POS from './pos';
import { useAppState } from '../../../contexts/app-state';
import { useCollection } from '../hooks/use-collection';
// import { useRestHttpClient } from '../hooks/use-rest-http-client';
import { ReceiptModal } from '../receipt';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';
type OrderDocument = import('@wcpos/database').OrderDocument;

export type POSStackParamList = {
	POS: { orderID?: string };
	Checkout: { orderID: string };
	Receipt: { orderID: string };
};

const Stack = createStackNavigator<POSStackParamList>();

/**
 *
 */
const POSWithProviders = ({ route }: NativeStackScreenProps<POSStackParamList, 'POS'>) => {
	const { wpCredentials, store } = useAppState();
	const cashierID = useObservableEagerState(wpCredentials.id$);
	const storeID = useObservableEagerState(store.id$);
	const { collection: ordersCollection } = useCollection('orders');
	// const http = useRestHttpClient();

	/**
	 * Fetch all open orders
	 */
	// const query = useQuery({
	// 	queryKeys: ['orders', { status: 'pos-open' }],
	// 	collectionName: 'orders',
	// 	initialParams: {
	// 		selector: { status: 'pos-open' },
	// 		sortBy: 'date_created_gmt',
	// 		sortDirection: 'asc',
	// 	},
	// 	greedy: true,
	// });

	/**
	 * Hack to fetch open orders
	 *
	 * @TODO - do I really need all the open orders? Let them go to Orders page
	 */
	// React.useEffect(() => {
	// 	async function fetchOpenOrders() {
	// 		const localOrders = await ordersCollection.find({ selector: { status: 'pos-open' } }).exec();
	// 		const response = await http.get('orders', { params: { status: 'pos-open', per_page: '50' } });
	// 		if (response && response.data) {
	// 			const documents = response.data.map((doc) => ordersCollection.parseRestResponse(doc));
	// 			await ordersCollection.bulkUpsert(documents);
	// 		}
	// 	}
	// 	fetchOpenOrders();
	// }, [http, ordersCollection]);

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
						const filteredAndSortedDocs = orderBy(
							filteredDocs,
							[(v) => v.date_created_gmt],
							['asc']
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
			<CurrentOrderProvider resource={resource} currentOrderUUID={route.params?.orderID}>
				<Suspense>
					<POS />
				</Suspense>
			</CurrentOrderProvider>
		</Suspense>
	);
};

/**
 * Memoise initial query for orders and gateways
 */
const CheckoutWithProviders = ({
	route,
}: NativeStackScreenProps<POSStackParamList, 'Checkout'>) => {
	const orderID = get(route, ['params', 'orderID']);
	const { collection } = useCollection('orders');
	const query = collection.findOneFix(orderID);

	const resource = React.useMemo(() => new ObservableResource(query.$), [query]);

	return (
		<ErrorBoundary>
			<Suspense>
				<Checkout resource={resource} />
			</Suspense>
		</ErrorBoundary>
	);
};

/**
 *
 */
const ReceiptWithProviders = ({ route }: NativeStackScreenProps<POSStackParamList, 'Receipt'>) => {
	const orderID = get(route, ['params', 'orderID']);
	const { collection } = useCollection('orders');
	const query = collection.findOneFix(orderID);

	const resource = React.useMemo(() => new ObservableResource(query.$), [query]);

	return (
		<ErrorBoundary>
			<Suspense>
				<ReceiptModal resource={resource} />
			</Suspense>
		</ErrorBoundary>
	);
};

/**
 * The actual navigator
 */
const POSStackNavigator = () => {
	return (
		<ErrorBoundary>
			<Suspense>
				<Stack.Navigator screenOptions={{ headerShown: false }}>
					<Stack.Screen name="POS" component={POSWithProviders} />
					<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
						<Stack.Screen name="Checkout" component={CheckoutWithProviders} />
						<Stack.Screen name="Receipt" component={ReceiptWithProviders} />
					</Stack.Group>
				</Stack.Navigator>
			</Suspense>
		</ErrorBoundary>
	);
};

export default POSStackNavigator;
