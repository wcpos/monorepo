import * as React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import Auth from '@wcpos/common/src/screens/auth';
import Modal from '@wcpos/common/src/screens/modal';

// import MainNavigator from './main';
// const AuthScreen = React.lazy(() => import('../pages/auth'));
const MainNavigator = React.lazy(() => import('./main'));

export type AppNavigatorParams = {
	Auth: undefined;
	Main: undefined;
	Modal: undefined;
};

const Stack = createStackNavigator<AppNavigatorParams>();
type StackNavigatorProps = React.ComponentProps<typeof Stack.Navigator>;

const AppNavigator = (props: Partial<StackNavigatorProps>) => {
	const { storeDB } = useAppState();

	return (
		<Stack.Navigator screenOptions={{ headerShown: false }}>
			{storeDB ? (
				<Stack.Screen name="Main" component={MainNavigator} />
			) : (
				<Stack.Screen name="Auth" component={Auth} />
			)}
			<Stack.Screen name="Modal" component={Modal} options={{ presentation: 'transparentModal' }} />
		</Stack.Navigator>
	);
};

export default AppNavigator;
