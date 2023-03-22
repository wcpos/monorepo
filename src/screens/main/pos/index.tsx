import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';
import get from 'lodash/get';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';

import Checkout from './checkout';
import { CurrentOrderProvider } from './contexts/current-order';
import POS from './pos';
import useLocalData from '../../../contexts/local-data';
import { t } from '../../../lib/translations';
import { ModalLayout } from '../../components/modal-layout';
import { GatewaysProvider } from '../contexts/gateways';
import { OrdersProvider } from '../contexts/open-orders';
import Receipt from '../receipt';

export type POSStackParamList = {
	POS: { orderID?: string };
	Checkout: { orderID: string };
	Receipt: { orderID: string };
};

const Stack = createStackNavigator<POSStackParamList>();

/**
 *
 */
const POSStackNavigator = () => {
	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>Loading POSStackNavigator...</Text>}>
				<Stack.Navigator screenOptions={{ headerShown: false }}>
					<Stack.Screen name="POS">
						{({ route }) => {
							const orderID = get(route, ['params', 'orderID']);
							return (
								<OrdersProvider
									initialQuery={{
										sortBy: 'date_created_gmt',
										sortDirection: 'desc',
										selector: { status: 'pos-open' },
									}}
								>
									<CurrentOrderProvider orderID={orderID}>
										<React.Suspense fallback={<Text>Loading POS...</Text>}>
											<POS />
										</React.Suspense>
									</CurrentOrderProvider>
								</OrdersProvider>
							);
						}}
					</Stack.Screen>
					<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
						<Stack.Screen name="Checkout">
							{({ route }) => {
								const orderID = get(route, ['params', 'orderID']);
								return (
									<OrdersProvider initialQuery={{ selector: { uuid: orderID }, limit: 1 }}>
										<GatewaysProvider initialQuery={{ selector: { enabled: true } }}>
											<ModalLayout
												size="xLarge"
												title={t('Checkout', { _tags: 'core' })}
												primaryAction={{
													label: t('Process Payment', { _tags: 'core' }),
												}}
											>
												<React.Suspense fallback={<Text>Loading Checkout...</Text>}>
													<Checkout />
												</React.Suspense>
											</ModalLayout>
										</GatewaysProvider>
									</OrdersProvider>
								);
							}}
						</Stack.Screen>
						<Stack.Screen name="Receipt">
							{({ route }) => {
								const orderID = get(route, ['params', 'orderID']);
								return (
									<OrdersProvider initialQuery={{ selector: { uuid: orderID }, limit: 1 }}>
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
											<React.Suspense fallback={<Text>Loading Receipt...</Text>}>
												<Receipt />
											</React.Suspense>
										</ModalLayout>
									</OrdersProvider>
								);
							}}
						</Stack.Screen>
					</Stack.Group>
				</Stack.Navigator>
			</React.Suspense>
		</ErrorBoundary>
	);
};

export default POSStackNavigator;
