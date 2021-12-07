import * as React from 'react';
import { RouteProp, CompositeNavigationProp } from '@react-navigation/native';
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Auth from '@wcpos/common/src/screens/auth';
// import Modal from '@wcpos/common/src/screens/modal';
import Login from '@wcpos/common/src/screens/modal/login';

const MainNavigator = React.lazy(() => import('./main'));

export type AppStackParamList = {
	Auth: undefined;
	Main: undefined;
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
		</Stack.Navigator>
	);
};

export default AppNavigator;
