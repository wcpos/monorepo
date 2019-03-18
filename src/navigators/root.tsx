import { createSwitchNavigator } from '@react-navigation/core';
import Loading from '../sections/auth/loading';
import Auth from './auth';
import Main from './main';

const RootStack = createSwitchNavigator(
	{
		Loading: {
			screen: Loading,
			path: 'loading',
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
		initialRouteName: 'Loading',
	}
);

export default RootStack;
