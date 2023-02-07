import * as React from 'react';

import { NavigationContainer, LinkingOptions, getStateFromPath } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as Linking from 'expo-linking';
import get from 'lodash/get';
import { useTheme } from 'styled-components/native';

import log from '@wcpos/utils/src/logger';

import AuthNavigator, { authStackRoutes } from './auth';
import MainNavigator, { mainStackRoutes } from './main';
import useStore from '../contexts/store';
import { URL } from '../lib/url';

// import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
// const MainNavigator = React.lazy(() => import('./main'));

export type RootStackParamList = {
	AuthStack: undefined;
	MainStack: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();
const prefix = Linking.createURL('/');
const prefixes = ['wcpos://', prefix];

/**
 *
 */
const RootNavigator = ({ initialProps }) => {
	const { storeDB } = useStore();
	const theme = useTheme();
	const homepage = get(initialProps, 'homepage');
	log.silly(prefixes);

	/**
	 * Pathname eg: 'pos' for default web app
	 */
	let pathname;

	if (homepage) {
		const parsedUrl = new URL(homepage);
		prefixes.push(parsedUrl.host);
		pathname = parsedUrl.pathname;
	}

	const linking = {
		prefixes,
		config: {
			screens: {
				AuthStack: authStackRoutes,
				MainStack: mainStackRoutes,
			},
		},
	} as LinkingOptions<RootStackParamList>;

	// add pathname to linking config for web, eg: 'pos' slug
	if (pathname) {
		linking.config.screens.path = pathname;
	}

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
