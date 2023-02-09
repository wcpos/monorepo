import * as React from 'react';

import { NavigationContainer, LinkingOptions, getStateFromPath } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as Linking from 'expo-linking';
import get from 'lodash/get';
import { useTheme } from 'styled-components/native';

import log from '@wcpos/utils/src/logger';

import AuthNavigator from './auth';
import MainNavigator from './main';
import useStore from '../contexts/store';
import { URL } from '../lib/url';

// import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
// const MainNavigator = React.lazy(() => import('./main'));

export type RootStackParamList = {
	AuthStack: undefined;
	MainStack: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

/**
 *
 */
const RootNavigator = ({ initialProps }) => {
	const { storeDB } = useStore();
	const theme = useTheme();
	const homepage = get(initialProps, 'homepage');

	/**
	 * Pathname eg: 'pos' for default web app
	 */
	let pathname = '/';
	if (homepage) {
		const parsedUrl = new URL(homepage);
		pathname = parsedUrl.pathname;
	}
	const baseURL = Linking.createURL(pathname);

	const linking = {
		prefixes: ['wcpos://', baseURL],
		config: {
			screens: {
				AuthStack: {
					path: pathname + 'connect',
					screens: {
						Connect: '',
						Login: 'login/:siteID',
					},
				},
				MainStack: {
					path: pathname,
					screens: {
						MainDrawer: {
							// path: pathname,
							screens: {
								POSStack: {
									path: 'cart',
									screens: {
										POS: ':orderID?',
										Checkout: ':orderID/checkout',
										Receipt: 'receipt/:orderID',
									},
								},
								ProductsStack: {
									path: 'products',
									screens: {
										Products: '',
										EditProduct: 'edit/:productID',
									},
								},
								OrdersStack: {
									path: 'orders',
									screens: {
										Orders: '',
										EditOrder: 'edit/:orderID',
										Receipt: 'receipt/:orderID',
									},
								},
								CustomersStack: {
									path: 'customers',
									screens: {
										Customers: '',
										AddCustomer: 'add',
										EditCustomer: 'edit/:customerID',
									},
								},
							},
						},
						Settings: 'settings',
						Login: 'login',
					},
				},
			},
		},
	} as LinkingOptions<RootStackParamList>;

	return (
		<NavigationContainer
			linking={linking}
			theme={{
				dark: false,
				colors: {
					primary: theme.colors.primary,
					background: theme.colors.bodyBackground,
					card: 'rgb(255, 255, 255)',
					text: theme.colors.text,
					border: theme.colors.border,
					notification: 'rgb(255, 69, 58)',
				},
			}}
			/**
			 * Nested navigators require some fenessing
			 */
			documentTitle={{
				formatter: (options, route) => {
					return options.title ?? route.name;
				},
			}}
		>
			<Stack.Navigator screenOptions={{ headerShown: false }}>
				{storeDB ? (
					<Stack.Screen name="MainStack" component={MainNavigator} />
				) : (
					<Stack.Screen
						name="AuthStack"
						component={AuthNavigator}
						options={{ title: 'WooCommerce POS' }}
					/>
				)}
			</Stack.Navigator>
		</NavigationContainer>
	);
};

export default RootNavigator;
