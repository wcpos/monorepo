import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as Linking from 'expo-linking';
import { useTheme } from 'styled-components/native';
import get from 'lodash/get';
import useAuth from '@wcpos/hooks/src/use-auth';
import { Login, Modal, Settings } from './modals';
import Auth from './auth';
import MainNavigator from './main';
import Url from '../lib/url-parse';
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
	const { storeDBResource } = useAuth();
	const theme = useTheme();
	const homepage = get(initialProps, 'homepage');
	console.log(prefixes);

	let pathname = '';

	if (homepage) {
		const parsedUrl = new Url(homepage);
		prefixes.push(parsedUrl.host);
		pathname = parsedUrl.pathname;
	}

	const linking = React.useMemo(
		() => ({
			prefixes,
			config: {
				initialRouteName: 'Auth',
				screens: {
					Auth: `${pathname}/auth`,
					Main: {
						path: pathname,
						screens: {
							POS: {
								path: '',
								screens: {
									Products: {
										path: 'products-tab',
									},
									Cart: {
										path: 'cart-tab',
									},
								},
							},
							Products: {
								path: 'products',
							},
							Orders: {
								path: 'orders',
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
		}),
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
				{storeDBResource ? (
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
