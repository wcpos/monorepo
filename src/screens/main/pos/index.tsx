import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';
import get from 'lodash/get';
import { ObservableResource, useObservable } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { from, of } from 'rxjs';
import { switchMap, distinctUntilChanged } from 'rxjs/operators';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';

import Checkout from './checkout';
import { CurrentOrderProvider } from './contexts/current-order';
import POS from './pos';
import { useNewOrder } from './use-new-order';
import { useQuery } from '../../../contexts/store-state-manager';
import { useT } from '../../../contexts/translations';
import { ModalLayout } from '../../components/modal-layout';
import { TaxHelpersProvider } from '../contexts/tax-helpers';
import useCollection from '../hooks/use-collection';
import Receipt from '../receipt';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

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
	const { newOrder$ } = useNewOrder();
	const { collection } = useCollection('orders');

	/**
	 * Construct observable which emits order document when orderID changes
	 */
	const currentOrder$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([uuid]) => {
					if (!uuid) return newOrder$;
					return collection.findOne(uuid).$.pipe(
						// make sure we have an order, eg: voiding an order will emit null
						switchMap((order) => (isRxDocument(order) ? of(order) : newOrder$)),
						distinctUntilChanged((prev, next) => prev?.uuid === next?.uuid)
					);
				})
			),
		[route.params?.orderID]
	);

	/**
	 * Create resource so we can suspend until order is loaded
	 */
	const resource = React.useMemo(() => new ObservableResource(currentOrder$), [currentOrder$]);

	/**
	 *
	 */
	const openOrdersQuery = useQuery({
		queryKeys: ['orders', { status: 'pos-open' }],
		collectionName: 'orders',
		initialQuery: {
			selector: { status: 'pos-open' },
			sortBy: 'date_created_gmt',
			sortDirection: 'asc',
		},
	});

	/**
	 *
	 */
	const taxQuery = useQuery({
		queryKeys: ['tax-rates', 'pos'],
		collectionName: 'taxes',
	});

	return (
		<Suspense>
			<CurrentOrderProvider resource={resource} taxQuery={taxQuery}>
				<Suspense>
					<TaxHelpersProvider taxQuery={taxQuery}>
						<Suspense>
							<POS />
						</Suspense>
					</TaxHelpersProvider>
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
	const t = useT();

	const resource = React.useMemo(
		() => new ObservableResource(from(collection.findOneFix(orderID).exec())),
		[collection, orderID]
	);

	return (
		<ModalLayout
			size="xLarge"
			title={t('Checkout', { _tags: 'core' })}
			primaryAction={{
				label: t('Process Payment', { _tags: 'core' }),
			}}
			style={{ minHeight: '80%' }}
		>
			<Suspense>
				<Checkout resource={resource} />
			</Suspense>
		</ModalLayout>
	);
};

/**
 *
 */
const ReceiptWithProviders = ({ route }: NativeStackScreenProps<POSStackParamList, 'Receipt'>) => {
	const orderID = get(route, ['params', 'orderID']);
	const { collection } = useCollection('orders');
	const t = useT();

	const resource = React.useMemo(
		() => new ObservableResource(from(collection.findOneFix(orderID).exec())),
		[collection, orderID]
	);

	return (
		<ModalLayout
			title={t('Receipt', { _tags: 'core' })}
			primaryAction={{
				label: t('Print Receipt', { _tags: 'core' }),
			}}
			secondaryActions={[
				{
					label: t('Email Receipt', { _tags: 'core' }),
				},
			]}
			style={{ height: '100%' }}
		>
			<Suspense>
				<Receipt resource={resource} />
			</Suspense>
		</ModalLayout>
	);
};

/**
 * The actual navigator
 */
const POSStackNavigator = () => {
	console.log('pos stack');
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
