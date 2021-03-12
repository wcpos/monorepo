import * as React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import AuthScreen from '@wcpos/common/src/screens/auth';
import Text from '@wcpos/common/src/components/text';
// import MainNavigator from './main';
// const AuthScreen = React.lazy(() => import('../pages/auth'));
// const MainNavigator = React.lazy(() => import('./main'));

export type AppNavigatorParams = {
	Auth: undefined;
	Main: undefined;
};

const Stack = createStackNavigator<AppNavigatorParams>();
type StackNavigatorProps = React.ComponentProps<typeof Stack.Navigator>;

const AppNavigator = (props: Partial<StackNavigatorProps>) => {
	const { storeDB } = useAppState();

	return (
		<Stack.Navigator headerMode="none">
			{storeDB ? (
				<Stack.Screen name="Main" component={() => <Text>Main</Text>} />
			) : (
				<Stack.Screen name="Auth" component={AuthScreen} />
			)}
		</Stack.Navigator>
	);
};

export default AppNavigator;
