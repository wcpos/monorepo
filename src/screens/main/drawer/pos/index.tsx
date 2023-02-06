import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from 'styled-components/native';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import Checkout from './checkout';
import POSColumns from './columns';
import { CurrentOrderProvider } from './contexts/current-order';
import POSTabs from './tabs';
import { GatewaysProvider } from '../../../../contexts/gateways';
import { OrdersProvider } from '../../../../contexts/orders';
import { TaxesProvider } from '../../../../contexts/taxes';
import { t } from '../../../../lib/translations';
import { ModalLayout } from '../../../components/modal-layout';
import Receipt from '../receipt';

export type POSStackParamList = {
	POS: { orderID?: string };
	Checkout: { orderID: string };
	Receipt: undefined;
};

const Stack = createStackNavigator<POSStackParamList>();

/**
 *
 */
const POSStackNavigator = () => {
	const theme = useTheme();
	const dimensions = useWindowDimensions();

	const taxQuery = React.useMemo(() => ({ country: 'GB' }), []);

	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>Loading POSStackNavigator...</Text>}>
				<Stack.Navigator screenOptions={{ headerShown: false }}>
					<Stack.Screen name="POS">
						{() => (
							<ErrorBoundary>
								<React.Suspense fallback={<Text>Loading POS...</Text>}>
									<CurrentOrderProvider>
										<TaxesProvider initialQuery={taxQuery}>
											{dimensions.width >= theme.screens.small ? <POSColumns /> : <POSTabs />}
										</TaxesProvider>
									</CurrentOrderProvider>
								</React.Suspense>
							</ErrorBoundary>
						)}
					</Stack.Screen>
					<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
						<Stack.Screen name="Checkout">
							{({ route }) => {
								const { orderID } = route.params;
								return (
									<OrdersProvider initialQuery={{ filters: { uuid: orderID } }}>
										<GatewaysProvider initialQuery={{ filters: { enabled: true } }}>
											<ModalLayout
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
						<Stack.Screen name="Receipt" component={Receipt} />
					</Stack.Group>
				</Stack.Navigator>
			</React.Suspense>
		</ErrorBoundary>
	);
};

export default POSStackNavigator;
