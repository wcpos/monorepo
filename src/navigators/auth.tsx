import { createStackNavigator } from 'react-navigation';
import Auth, { Modal } from '../sections/auth';

const AuthStack = createStackNavigator(
	{
		Auth: {
			screen: Auth,
			path: '',
		},
		Modal: {
			screen: Modal,
			path: 'login',
		},
	},
	{
		mode: 'modal',
		headerMode: 'none',
	}
);

export default AuthStack;
