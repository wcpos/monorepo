import * as React from 'react';

import { createStackNavigator } from '@react-navigation/stack';

import DrawerNavigator from './drawer/_navigator';
import Header from './header';
import Login from './modals/login';
import Settings from './modals/settings';

export type MainStackParamList = {
	Drawer: undefined;
	Settings: undefined;
	Login: undefined;
	Receipt: undefined;
};

const Stack = createStackNavigator<MainStackParamList>();

/**
 *
 */
const MainNavigator = ({ navigation, route }) => {
	return (
		<Stack.Navigator
			screenOptions={{
				header: (props) => <Header {...props} />,
			}}
		>
			<Stack.Screen name="Drawer" component={DrawerNavigator} />
			<Stack.Group screenOptions={{ presentation: 'transparentModal' }}>
				<Stack.Screen name="Settings" component={Settings} />
				<Stack.Screen name="Login" component={Login} />
			</Stack.Group>
		</Stack.Navigator>
	);
};

export default MainNavigator;
