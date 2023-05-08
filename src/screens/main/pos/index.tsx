import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';
import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { combineLatest } from 'rxjs';
import { map } from 'rxjs/operators';

import ErrorBoundary from '@wcpos/components/src/error-boundary';

import Checkout from './checkout';
import { CurrentOrderProvider } from './contexts/current-order';
import POS from './pos';
import useLocalData from '../../../contexts/local-data';
import { t } from '../../../lib/translations';
import { ModalLayout } from '../../components/modal-layout';
import { CustomersProvider } from '../contexts/customers';
import { OrdersProvider } from '../contexts/orders';
import Receipt from '../receipt';

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type POSStackParamList = {
	POS: { orderID?: string };
	Checkout: { orderID: string };
	Receipt: { orderID: string };
};

const Stack = createStackNavigator<POSStackParamList>();

/**
 * Memoised initial query for open orders, prevents re-rendering
 */
const POSWithProviders = ({ route }: NativeStackScreenProps<POSStackParamList, 'POS'>) => {
	const orderID = get(route, ['params', 'orderID']);
	const initialQuery = React.useMemo(
		() => ({
			sortBy: 'date_created_gmt',
			sortDirection: 'desc',
			selector: { status: 'pos-open' },
		}),
		[]
	);

	return (
		<OrdersProvider initialQuery={initialQuery}>
			<React.Suspense
			// suspend until orders and default customer are loaded
			>
				<CurrentOrderProvider orderID={orderID}>
					<POS />
				</CurrentOrderProvider>
			</React.Suspense>
		</OrdersProvider>
	);
};

/**
 * Memoise initial query for orders and gateways
 */
const CheckoutWithProviders = ({
	route,
}: NativeStackScreenProps<POSStackParamList, 'Checkout'>) => {
	const orderID = get(route, ['params', 'orderID']);

	const initialOrdersQuery = React.useMemo(
		() => ({ selector: { uuid: orderID }, limit: 1 }),
		[orderID]
	);
	// const initialGatewaysQuery = React.useMemo(() => ({ selector: { enabled: true } }), []);

	return (
		<OrdersProvider initialQuery={initialOrdersQuery}>
			{/* <GatewaysProvider initialQuery={initialGatewaysQuery}> */}
			<ModalLayout
				size="xLarge"
				title={t('Checkout', { _tags: 'core' })}
				primaryAction={{
					label: t('Process Payment', { _tags: 'core' }),
				}}
				style={{ minHeight: '80%' }}
			>
				<React.Suspense>
					<Checkout />
				</React.Suspense>
			</ModalLayout>
			{/* </GatewaysProvider> */}
		</OrdersProvider>
	);
};

/**
 *
 */
const ReceiptWithProviders = ({ route }: NativeStackScreenProps<POSStackParamList, 'Receipt'>) => {
	const orderID = get(route, ['params', 'orderID']);

	const initialOrdersQuery = React.useMemo(
		() => ({ selector: { uuid: orderID }, limit: 1 }),
		[orderID]
	);

	return (
		<OrdersProvider initialQuery={initialOrdersQuery}>
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
				<React.Suspense>
					<Receipt />
				</React.Suspense>
			</ModalLayout>
		</OrdersProvider>
	);
};

/**
 * The actual navigator
 */
const POSStackNavigator = () => {
	return (
		<ErrorBoundary>
			<React.Suspense>
				<Stack.Navigator screenOptions={{ headerShown: false }}>
					<Stack.Screen name="POS" component={POSWithProviders} />
					<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
						<Stack.Screen name="Checkout" component={CheckoutWithProviders} />
						<Stack.Screen name="Receipt" component={ReceiptWithProviders} />
					</Stack.Group>
				</Stack.Navigator>
			</React.Suspense>
		</ErrorBoundary>
	);
};

export default POSStackNavigator;
