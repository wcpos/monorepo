import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import SplashScreen from '../pages/splash';
import useUser from '../hooks/use-user';
// import AuthScreen from '../pages/auth';
// import POSNavigator from './pos';
const AuthScreen = React.lazy(() => import('../pages/auth'));
const POSNavigator = React.lazy(() => import('./pos'));

type StackNavigatorProps = React.ComponentProps<typeof Stack.Navigator>;

export type AppNavigatorParams = {
	Auth: undefined;
	POS: undefined;
	Splash: undefined;
};

const Stack = createStackNavigator<AppNavigatorParams>();

const AppNavigator = (props: Partial<StackNavigatorProps>): React.ReactElement => {
	const { user } = useUser();

	return (
		<Stack.Navigator headerMode="none">
			{!user ? (
				<Stack.Screen name="Splash">{() => <SplashScreen />}</Stack.Screen>
			) : user?.authenticated ? (
				<Stack.Screen name="POS" component={POSNavigator} />
			) : (
				<Stack.Screen name="Auth" component={AuthScreen} />
			)}
		</Stack.Navigator>
	);
};

export default AppNavigator;
