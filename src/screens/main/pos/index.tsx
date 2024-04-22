import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';
import get from 'lodash/get';
import { ObservableResource, useObservable } from 'observable-hooks';
import { from, of, Observable } from 'rxjs';
import { distinctUntilChanged, switchMap } from 'rxjs/operators';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Suspense from '@wcpos/components/src/suspense';
import { useQuery } from '@wcpos/query';

import Checkout from './checkout';
import { CurrentOrderProvider } from './contexts/current-order';
import POS from './pos';
import { useT } from '../../../contexts/translations';
import { ModalLayout } from '../../components/modal-layout';
import { useCollection } from '../hooks/use-collection';
import Receipt from '../receipt';

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
	const { collection } = useCollection('orders');

	/**
	 *
	 */
	useQuery({
		queryKeys: ['orders', { status: 'pos-open' }],
		collectionName: 'orders',
		initialParams: {
			selector: { status: 'pos-open' },
			sortBy: 'date_created_gmt',
			sortDirection: 'asc',
		},
	});

	/**
	 *
	 */
	const order$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				switchMap(([uuid]) =>
					uuid ? collection.findOne({ selector: { uuid, status: 'pos-open' } }).$ : of(null)
				),
				distinctUntilChanged((prev, next) => prev?.uuid === next?.uuid)
			),
		[route.params?.orderID]
	);

	/**
	 *
	 */
	const resource = React.useMemo(() => new ObservableResource(order$), [order$]);

	return (
		<Suspense>
			<CurrentOrderProvider resource={resource}>
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
				disabled: true,
				loading: true,
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
