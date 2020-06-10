import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { Text } from 'react-native';
import AuthNavigator from './auth';

interface AppNavigatorProps {}

const AppNavigator: React.FC<AppNavigatorProps> = ({}) => {
	const linking = {
		prefixes: ['https://localhost', 'wcpos://'],
		// config: {
		// 	Auth: 'auth',
		// 	Main: '',
		// 	POS: '',
		// 	Products: 'products',
		// 	Support: 'support',
		// },
	};

	return (
		<NavigationContainer
			// linking={linking}
			fallback={<Text>Deep link</Text>}
			// onStateChange={(state) => console.log('New state is', state)}
		>
			<AuthNavigator />
		</NavigationContainer>
	);
};

export default AppNavigator;
