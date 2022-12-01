import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';
import log from '@wcpos/utils/src/logger';

import Receipt from '../receipt';
import Orders from './orders';

export type OrdersStackParamList = {
	Orders: undefined;
	Receipt: { _id: string };
};

const Stack = createStackNavigator<OrdersStackParamList>();

/**
 *
 */
const OrdersNavigator = () => {
	log.debug('render OrdersNavigator');

	return (
		<ErrorBoundary>
			<React.Suspense fallback={<Text>Loading orders UI</Text>}>
				<Stack.Navigator screenOptions={{ headerShown: false }}>
					<Stack.Screen name="Orders" component={Orders} />
					<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
						<Stack.Screen name="Receipt" component={Receipt} />
					</Stack.Group>
				</Stack.Navigator>
			</React.Suspense>
		</ErrorBoundary>
	);
};

export default OrdersNavigator;
