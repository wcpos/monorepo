import * as React from 'react';

import { NavigationContainer, LinkingOptions, getStateFromPath } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as Linking from 'expo-linking';
import get from 'lodash/get';
import { useTheme } from 'styled-components/native';

import log from '@wcpos/utils/src/logger';

import useStore from '../contexts/store';
import { URL } from '../lib/url';
import Auth from './auth';
import MainNavigator from './main';
import { Login, Modal, Settings } from './modals';

// import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
// const MainNavigator = React.lazy(() => import('./main'));

export type RootStackParamList = {
	Auth: undefined;
	Main: undefined;
	Modal: undefined;
	Login: undefined;
	Settings: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const prefix = Linking.createURL('/');
const prefixes = ['wcpos://', prefix];

/**
 *
 */
export const RootNavigator = ({ initialProps }) => {
	const { storeDB } = useStore();
	const theme = useTheme();
	const homepage = get(initialProps, 'homepage');
	log.silly(prefixes);

	let pathname = '';

	if (homepage) {
		const parsedUrl = new URL(homepage);
		prefixes.push(parsedUrl.host);
		pathname = parsedUrl.pathname;
	}

	const linking = React.useMemo(
		() =>
			({
				prefixes,
				config: {
					initialRouteName: 'Main',
					screens: {
						Auth: `${pathname}/auth`,
						Main: {
							path: pathname,
							screens: {
								POS: {
									path: '',
									screens: {
										Columns: {
											path: '',
										},
										Tabs: {
											path: 'tab',
											screens: {
												Products: {
													path: 'products',
												},
												Cart: {
													path: 'cart',
												},
											},
										},
										Checkout: {
											path: 'checkout/:_id',
										},
										Receipt: {
											path: 'receipt/:_id',
										},
									},
								},
								Products: {
									path: 'products',
								},
								Orders: {
									path: 'orders',
									screens: {
										Orders: {
											path: '/', // if this is empty it will be the default screen?
										},
										Receipt: {
											path: 'receipt/:_id',
										},
									},
								},
								Customers: {
									path: 'customers',
								},
								Support: {
									path: 'support',
								},
							},
						},
						Modal: `${pathname}/#`,
						Login: `${pathname}/login`,
						Settings: `${pathname}/settings`,
					},
				},
				getStateFromPath: (path, options) => {
					const state = getStateFromPath(path, options);
					log.debug('getStateFromPath', state);
					return state;
				},
			} as LinkingOptions<RootStackParamList>),
		[pathname]
	);

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
		>
			<Stack.Navigator screenOptions={{ headerShown: false }}>
				{storeDB ? (
					<Stack.Screen name="Main" component={MainNavigator} />
				) : (
					<Stack.Screen name="Auth" component={Auth} options={{ title: 'WooCommerce POS' }} />
				)}
				<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
					<Stack.Screen name="Login" component={Login} />
					<Stack.Screen name="Settings" component={Settings} />
					<Stack.Screen name="Modal" component={Modal} />
				</Stack.Group>
			</Stack.Navigator>
		</NavigationContainer>
	);
};
