import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';
import { useObservableState } from 'observable-hooks';

import { OnlineStatusProvider } from '@wcpos/hooks/src/use-online-status';

import DrawerNavigator from './drawer';
import { ModalLayout } from './layout';
import Login from './modals/login';
import Settings from './settings';
import useAuth from '../../contexts/auth';

export type MainStackParamList = {
	MainDrawer: undefined;
	Settings: undefined;
	Login: undefined;
};

const Stack = createStackNavigator<MainStackParamList>();

/**
 *
 */
const MainNavigator = ({ navigation, route }) => {
	const { site } = useAuth();
	const wpAPIURL = useObservableState(site.wp_api_url$, site.wp_api_url);

	return (
		<OnlineStatusProvider wpAPIURL={wpAPIURL}>
			<Stack.Navigator screenOptions={{ headerShown: false }}>
				<Stack.Screen name="MainDrawer" component={DrawerNavigator} />
				<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
					<Stack.Screen name="Settings">
						{() => (
							<ModalLayout>
								<Settings />
							</ModalLayout>
						)}
					</Stack.Screen>
					<Stack.Screen name="Login" component={Login} />
				</Stack.Group>
			</Stack.Navigator>
		</OnlineStatusProvider>
	);
};

export default MainNavigator;
