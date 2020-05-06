import React from 'react';
import AuthScreen from '../pages/auth';
import POSNavigator from './pos';
import SplashScreen from '../pages/splash';
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
	const [isReady, setIsReady] = React.useState(false);

	const user = {
		authenticated: true,
	};

	return (
		<Stack.Navigator headerMode="none">
			{!isReady ? (
				<Stack.Screen name="Splash">
					{() => <SplashScreen onReady={() => setIsReady(true)} />}
				</Stack.Screen>
			) : user.authenticated ? (
				<Stack.Screen name="POS" component={POSNavigator} />
			) : (
				<Stack.Screen name="Auth" component={AuthScreen} />
			)}
		</Stack.Navigator>
	);
};

export default AppNavigator;
