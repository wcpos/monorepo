import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import Checkout from './checkout';
import { CurrentOrderProvider } from './contexts/current-order';
import POS from './index';
import { TaxesProvider } from '../../../../contexts/taxes';
import Receipt from '../receipt';

export type POSStackParamList = {
	POS: undefined;
	Checkout: { orderID: string };
	Receipt: undefined;
};

const Stack = createStackNavigator<POSStackParamList>();

/**
 *
 */
const POSNavigator = ({ navigation, route }) => {
	// const { orderID } = route.params;
	const orderID = '123';
	console.log('route', route);

	const taxQuery = React.useMemo(() => ({ country: 'GB' }), []);

	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>Loading POSNavigator...</Text>}>
				<CurrentOrderProvider orderID={orderID}>
					<TaxesProvider initialQuery={taxQuery}>
						<Stack.Navigator screenOptions={{ headerShown: false }}>
							<Stack.Screen name="POS" component={POS} />
							<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
								<Stack.Screen name="Checkout" component={Checkout} />
								<Stack.Screen name="Receipt" component={Receipt} />
							</Stack.Group>
						</Stack.Navigator>
					</TaxesProvider>
				</CurrentOrderProvider>
			</React.Suspense>
		</ErrorBoundary>
	);
};

export default POSNavigator;
