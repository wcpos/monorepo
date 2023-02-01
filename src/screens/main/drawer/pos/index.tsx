import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';

import Checkout from './checkout';
import POS from './pos';
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
	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>Loading POSStackNavigator...</Text>}>
				<Stack.Navigator screenOptions={{ headerShown: false }}>
					<Stack.Screen name="POS" component={POS} />
					<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
						<Stack.Screen name="Checkout" component={Checkout} />
						<Stack.Screen name="Receipt" component={Receipt} />
					</Stack.Group>
				</Stack.Navigator>
			</React.Suspense>
		</ErrorBoundary>
	);
};

export default POSStackNavigator;
