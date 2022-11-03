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
import { OrdersProvider } from '@wcpos/core/src/contexts/orders';
import { OpenOrdersProvider } from './contexts/open-orders';
import Columns from './resizable-columns';
import Tabs from './tabs';
import Checkout from './checkout';
import Receipt from './receipt';

export type POSStackParamList = {
	Columns: undefined;
	Tabs: undefined;
	Checkout: undefined;
	Receipt: undefined;
	// Settings: undefined;
};

const Stack = createStackNavigator<POSStackParamList>();

/**
 *
 */
const POS = () => {
	const { storeDB, uiResources } = useStore();
	const productsUI = useObservableSuspense(uiResources['pos.products']);
	const theme = useTheme();
	const { store } = useAuth();
	const storeName = useObservableState(store?.name$, store.name);
	console.log('render POS');

	/**
	 *
	 */
	const initialQuery = React.useMemo(
		() => ({
			sortBy: 'date_created_gmt',
			sortDirection: 'desc',
			filters: { status: 'pos-open' },
		}),
		[]
	);

	useWhyDidYouUpdate('POS', {
		productsUI,
		// openOrdersResource,
		theme,
		storeDB,
	});

	return (
		<OrdersProvider initialQuery={initialQuery}>
			<OpenOrdersProvider>
				<TaxesProvider initialQuery={{ country: 'GB' }}>
					<Stack.Navigator screenOptions={{ headerShown: false }}>
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
			</OpenOrdersProvider>
		</OrdersProvider>
	);
};

export default POS;
