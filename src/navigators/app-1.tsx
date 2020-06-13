import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { Text } from 'react-native';
import AuthNavigator from './auth';
import SplashPage from '../pages/splash';
import useAppState from '../hooks/use-app-state';

interface AppNavigatorProps {}

const AppNavigator: React.FC<AppNavigatorProps> = ({}) => {
	const [{ user }] = useAppState();

	if (!user) {
		// return null;
		return <SplashPage />;
	}

	return (
		<NavigationContainer
			fallback={<Text>Deep link</Text>}
			linking={{
				prefixes: ['https://localhost:3000', 'wcpos://'],
				config: {
					Auth: 'auth',
					Main: {
						path: 'main',
						screens: {
							POS: {
								path: 'pos',
							},
							Products: {
								path: 'products',
							},
							Support: {
								path: 'support',
							},
						},
					},
				},
			}}
			onStateChange={(state) => {
				console.log('New nav state', JSON.stringify(state, null, 2));
			}}
		>
			<AuthNavigator />
		</NavigationContainer>
	);
};

export default AppNavigator;
