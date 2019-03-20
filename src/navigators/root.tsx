import { createSwitchNavigator } from '@react-navigation/core';
import Home from '../sections/home';
import Auth from './auth';
import Main from './main';

const RootStack = createSwitchNavigator(
	{
		Home: {
			screen: Home,
			path: '',
		},
		Auth: {
			screen: Auth,
			path: 'auth',
		},
		Main: {
			screen: Main,
			path: 'pos',
		},
	},
	{
		initialRouteName: 'Home',
	}
);

export default RootStack;
