import * as React from 'react';
import { RouteProp, CompositeNavigationProp } from '@react-navigation/native';
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import useAppState from '@wcpos/hooks/src/use-app-state';
import useWhyDidYouUpdate from '@wcpos/hooks/src/use-why-did-you-update';
import Auth from '@wcpos/core/src/screens/auth';
import { Login, Modal } from '@wcpos/core/src/screens/modal';
import MainNavigator from './main';
// const MainNavigator = React.lazy(() => import('./main'));

export type AppStackParamList = {
	Auth: undefined;
	Main: undefined;
	Modal: undefined;
	Login: undefined;
};

const Stack = createStackNavigator<AppStackParamList>();

/**
 *
 */
const AppNavigator = () => {
	const { storeDB } = useAppState();

	// useWhyDidYouUpdate('AppNavigator', { props, storeDB });

	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			{storeDB ? (
				<Stack.Screen name="Main" component={MainNavigator} />
			) : (
				<Stack.Screen name="Auth" component={Auth} />
			)}
			<Stack.Screen name="Login" component={Login} options={{ presentation: 'transparentModal' }} />
			<Stack.Screen name="Modal" component={Modal} options={{ presentation: 'transparentModal' }} />
		</Stack.Navigator>
	);
};

export default AppNavigator;
