import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { createStackNavigator } from '@react-navigation/stack';
import { useObservableState } from 'observable-hooks';
import { useTheme } from 'styled-components/native';

import ErrorBoundary from '@wcpos/components/src/error-boundary';
import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import log from '@wcpos/utils/src/logger';

import useAuth from '../../../contexts/auth';
import { TaxesProvider } from '../../../contexts/taxes';
import Receipt from '../receipt';
import Checkout from './checkout';
import { CurrentOrderProvider } from './contexts/current-order';
import Columns from './resizable-columns';
import Tabs from './tabs';

export type POSStackParamList = {
	Columns: undefined;
	Tabs: undefined;
	Checkout: { _id: string };
	Receipt: { _id: string };
	// Settings: undefined;
};

const Stack = createStackNavigator<POSStackParamList>();

/**
 *
 */
const POS = ({ navigation, route }) => {
	const theme = useTheme();
	const dimensions = useWindowDimensions();
	const { store } = useAuth();
	const storeName = useObservableState(store?.name$, store.name);
	log.debug('render POS');

	useWhyDidYouUpdate('POS', {
		// productsUI,
		// openOrdersResource,
		theme,
		// storeDB,
		storeName,
		// uiResources,
		navigation,
		route,
	});

	const taxQuery = React.useMemo(() => ({ country: 'GB' }), []);

	return (
		<ErrorBoundary>
			<CurrentOrderProvider>
				<TaxesProvider initialQuery={taxQuery}>
					<Stack.Navigator screenOptions={{ headerShown: false }}>
						{dimensions.width >= theme.screens.small ? (
							<Stack.Screen name="Columns" component={Columns} options={{ title: storeName }} />
						) : (
							<Stack.Screen name="Tabs" component={Tabs} />
						)}
						<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
							<Stack.Screen name="Checkout" component={Checkout} />
							<Stack.Screen name="Receipt" component={Receipt} />
						</Stack.Group>
					</Stack.Navigator>
				</TaxesProvider>
			</CurrentOrderProvider>
		</ErrorBoundary>
	);
};

export default POS;
