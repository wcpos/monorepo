import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import Connect from './connect';
import Login from './login';
import { useAppState } from '../../contexts/app-state';

export type AuthStackParamList = {
	Connect: undefined;
	Login: { siteID: string };
};

const Stack = createStackNavigator<AuthStackParamList>();

/**
 *
 */
const AuthNavigator = () => {
	const { isWebApp } = useAppState();

	/**
	 * WebApps should never hit the Connect screen, if they do it usually means
	 * the database has thrown an error and we need to reset the database
	 */
	if (isWebApp) {
		throw new Error('Database error, please reload the app');
	}

	return (
		<Stack.Navigator
			screenOptions={{
				headerShown: false,
			}}
		>
			<Stack.Screen name="Connect" component={Connect} />
			<Stack.Screen name="Login" component={Login} options={{ presentation: 'transparentModal' }} />
		</Stack.Navigator>
	);
};

export default AuthNavigator;
