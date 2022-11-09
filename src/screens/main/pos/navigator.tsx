import * as React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from 'styled-components/native';
import { useObservableSuspense, useObservableState } from 'observable-hooks';
import ErrorBoundary from '@wcpos/components/src/error-boundary';
import useStore from '@wcpos/hooks/src/use-store';
import useAuth from '@wcpos/hooks/src/use-auth';
import { TaxesProvider } from '@wcpos/core/src/contexts/taxes';
import Text from '@wcpos/components/src/text';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import { CurrentOrderProvider } from './contexts/current-order';
import Columns from './resizable-columns';
import Tabs from './tabs';
import Checkout from './checkout';
import Receipt from './receipt';

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
	const { storeDB, uiResources } = useStore();
	const productsUI = useObservableSuspense(uiResources['pos.products']);
	const theme = useTheme();
	const { store } = useAuth();
	const storeName = useObservableState(store?.name$, store.name);
	console.log('render POS');

	useWhyDidYouUpdate('POS', {
		productsUI,
		// openOrdersResource,
		theme,
		storeDB,
		storeName,
		uiResources,
		navigation,
		route,
	});

	return (
		<CurrentOrderProvider>
			<TaxesProvider initialQuery={{ country: 'GB' }}>
				<Stack.Navigator initialRouteName="Columns" screenOptions={{ headerShown: false }}>
					{theme._dimensions.width >= theme.screens.small ? (
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
	);
};

export default POS;
