import * as React from 'react';
import { RouteProp, CompositeNavigationProp } from '@react-navigation/native';
import { createStackNavigator, StackNavigationProp } from '@react-navigation/stack';
import { DrawerNavigationProp } from '@react-navigation/drawer';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import Auth from '@wcpos/common/src/screens/auth';
import Modal from '@wcpos/common/src/screens/modal';

type DrawerParamList = import('./main').DrawerParamList;
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;

const MainNavigator = React.lazy(() => import('./main'));

export type AppStackParamList = {
	Auth: undefined;
	Main: undefined;
	Modal: { login?: { site?: import('@wcpos/common/src/database').SiteDocument } };
};

const Stack = createStackNavigator<AppStackParamList>();
type StackNavigatorProps = React.ComponentProps<typeof Stack.Navigator>;

export interface MainScreenProps {
	navigation: CompositeNavigationProp<
		DrawerNavigationProp<DrawerParamList>,
		StackNavigationProp<AppStackParamList, 'Main'>
	>;
	route: RouteProp<AppStackParamList, 'Main'>;
}

export interface AuthScreenProps {
	navigation: StackNavigationProp<AppStackParamList, 'Auth'>;
	route: RouteProp<AppStackParamList, 'Auth'>;
}

export interface ModalScreenProps {
	navigation: StackNavigationProp<AppStackParamList, 'Modal'>;
	route: RouteProp<AppStackParamList, 'Modal'>;
}

/**
 *
 */
const AppNavigator = (props: Partial<StackNavigatorProps>) => {
	const { storeDB } = useAppState();

	useWhyDidYouUpdate('AppNavigator', { props, storeDB });

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
