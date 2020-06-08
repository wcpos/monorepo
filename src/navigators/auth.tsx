import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { Linking } from 'react-native';
import SplashScreen from '../pages/splash';
import useDatabase from '../hooks/use-database';
import AuthScreen from '../pages/auth';
import POSNavigator from './pos';
// const AuthScreen = React.lazy(() => import('../pages/auth'));
// const POSNavigator = React.lazy(() => import('./pos'));

export type AppNavigatorParams = {
	Auth: undefined;
	POS: undefined;
	Splash: undefined;
};

const Stack = createStackNavigator<AppNavigatorParams>();
type StackNavigatorProps = React.ComponentProps<typeof Stack.Navigator>;

const AppNavigator = (props: Partial<StackNavigatorProps>): React.ReactElement => {
	const { user, storeDB } = useDatabase();
	// const [ready, isReady] = React.useState(false);

	// React.useEffect(() => {
	// 	const getInitialUrl = async () => {
	// 		const initialUrl = await Linking.getInitialURL();
	// 		console.log(initialUrl);
	// 		isReady(true);
	// 	};
	// 	getInitialUrl();
	// }, []);

	const renderApp = () => {
		if (!user) {
			return <Stack.Screen name="Splash">{() => <SplashScreen />}</Stack.Screen>;
		}
		if (user && storeDB) {
			return <Stack.Screen name="POS" component={POSNavigator} />;
		}
		return <Stack.Screen name="Auth" component={AuthScreen} />;
	};

	return <Stack.Navigator headerMode="none">{renderApp()}</Stack.Navigator>;
};

export default AppNavigator;
