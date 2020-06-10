import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { Linking } from 'react-native';
import SplashScreen from '../pages/splash';
import useDatabase from '../hooks/use-database';
import AuthScreen from '../pages/auth';
import MainNavigator from './main';
// const AuthScreen = React.lazy(() => import('../pages/auth'));
// const MainNavigator = React.lazy(() => import('./main'));

export type AppNavigatorParams = {
	Auth: undefined;
	Main: undefined;
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

	if (!user) {
		return <SplashScreen />;
	}

	return (
		<Stack.Navigator headerMode="none">
			{user && storeDB ? (
				<Stack.Screen name="Main" component={MainNavigator} />
			) : (
				<Stack.Screen name="Auth" component={AuthScreen} />
			)}
		</Stack.Navigator>
	);
};

export default AppNavigator;
