import React from 'react';
import AuthScreen from '../sections/auth';
import POSNavigator from './pos';
import SplashScreen from '../sections/splash';
import { createStackNavigator } from '@react-navigation/stack';
import useDatabaseContext from '../hooks/use-database-context';

type StackNavigatorProps = React.ComponentProps<typeof Stack.Navigator>;

export type AppNavigatorParams = {
	Auth: undefined;
	POS: undefined;
	Splash: undefined;
};

const Stack = createStackNavigator<AppNavigatorParams>();

const AppNavigator = (props: Partial<StackNavigatorProps>): React.ReactElement => {
	const { user } = useDatabaseContext();
	console.log('Auth Navigator: ' + user);

	return (
		<Stack.Navigator headerMode="none">
			{user === undefined ? (
				<Stack.Screen name="Splash" component={SplashScreen} />
			) : user.authenticated ? (
				<Stack.Screen name="POS" options={{ title: 'POS' }} component={POSNavigator} />
			) : (
				<Stack.Screen
					name="Auth"
					path="auth"
					options={{ title: 'Connect', test: 'foo' }}
					component={AuthScreen}
				/>
			)}
		</Stack.Navigator>
	);
};

export default AppNavigator;
