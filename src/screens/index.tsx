import * as React from 'react';

import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as Linking from 'expo-linking';
import get from 'lodash/get';
import { useObservableEagerState, useObservableState } from 'observable-hooks';
import { of } from 'rxjs';
import { useTheme } from 'styled-components/native';

import Suspense from '@wcpos/components/src/suspense';
import Text from '@wcpos/components/src/text';

import AuthNavigator from './auth';
import MainNavigator from './main';
import { useAppState } from '../contexts/app-state';
import { useT } from '../contexts/translations';
import { URL } from '../lib/url';

// const MainNavigator = React.lazy(() => import('./main'));

export type RootStackParamList = {
	AuthStack: undefined;
	MainStack: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

/**
 *
 */
const RootNavigator = () => {
	const { store, storeDB, initialProps } = useAppState();
	const theme = useTheme();
	const homepage = get(initialProps, 'homepage');
	const t = useT();

	/**
	 * store can be null, so we create an observable
	 */
	const storeName = useObservableState(store?.name$ ?? of(''), store?.name ?? '');

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
										AddProduct: 'add',
										EditProduct: 'edit/:productID',
										EditVariation: 'edit/:parentID/:variationID',
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
								SupportStack: {
									path: 'support',
								},
							},
						},
						Settings: 'settings',
						Login: 'login',
						TaxRates: 'tax-rates',
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
			documentTitle={{
				/**
				 * Nested navigators produce weird results, keep the title simple
				 */
				formatter: (options, route) => {
					if (!store) {
						return t('WooCommerce POS', { _tags: 'core' });
					}
					return `${t('POS', { _tags: 'core' })} - ${storeName}`;
				},
			}}
			// onStateChange={(state) => {
			// 	console.log('state', state);
			// }}
		>
			<Stack.Navigator
				/**
				 * The key is important here for switching stores and logging out
				 * It tells react to re-render the whole component tree
				 * - using token, but could also use storeDB.name, I'm not sure when rxdb token changes
				 */
				// key={storeDB?.token}
				screenOptions={{ headerShown: false }}
			>
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
