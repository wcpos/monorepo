import * as React from 'react';

import { NavigationContainer, LinkingOptions } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as Linking from 'expo-linking';
import get from 'lodash/get';
import { useObservableEagerState, useObservableSuspense } from 'observable-hooks';
import { of } from 'rxjs';

import { ErrorBoundary } from '@wcpos/components/src/error-boundary';
import { Suspense } from '@wcpos/components/src/suspense';

import Splash from './splash';
import { useAppState } from '../contexts/app-state';
import { useT } from '../contexts/translations';
import { URL } from '../lib/url';

const MainNavigator = React.lazy(() => import('./main'));
const AuthNavigator = React.lazy(() => import('./auth'));

export type RootStackParamList = {
	AuthStack: undefined;
	MainStack: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

/**
 *
 */
const RootNavigator = () => {
	const { store, storeDB, fastStoreDB, initialProps, hydrationResource, isReadyResource } =
		useAppState();
	useObservableSuspense(hydrationResource); // suspend until hydration is complete
	useObservableSuspense(isReadyResource); // suspend until app is ready
	const homepage = get(initialProps, 'homepage');
	const t = useT();

	/**
	 * store can be null, so we create an observable
	 */
	const storeName = useObservableEagerState(store ? store.name$ : of(''));

	/**
	 * Pathname eg: 'pos' for default web app
	 */
	let pathname = '/';
	if (homepage) {
		const parsedUrl = new URL(homepage);
		pathname = parsedUrl.pathname;
	}
	const baseURL = Linking.createURL(pathname);

	const linking = React.useMemo(
		() => ({
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
									ReportsStack: {
										path: 'reports',
										screens: {
											Reports: '',
										},
									},
									LogsStack: {
										path: 'logs',
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
		}),
		[baseURL, pathname]
	);

	return (
		<NavigationContainer
			linking={linking}
			theme={{
				dark: false,
				colors: {
					primary: '#127FBF',
					background: '#F0F4F8',
					card: 'rgb(255, 255, 255)',
					text: '#243B53',
					border: '#D9E2EC',
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
			// 	console.log('navigation state', state);
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
				{storeDB && fastStoreDB ? (
					<Stack.Screen name="MainStack">
						{(props) => (
							<ErrorBoundary>
								<Suspense fallback={<Splash progress={100} />}>
									<MainNavigator {...props} />
								</Suspense>
							</ErrorBoundary>
						)}
					</Stack.Screen>
				) : (
					<Stack.Screen name="AuthStack" options={{ title: 'WooCommerce POS' }}>
						{(props) => (
							<ErrorBoundary>
								<Suspense fallback={<Splash progress={100} />}>
									<AuthNavigator {...props} />
								</Suspense>
							</ErrorBoundary>
						)}
					</Stack.Screen>
				)}
			</Stack.Navigator>
		</NavigationContainer>
	);
};

export default RootNavigator;
