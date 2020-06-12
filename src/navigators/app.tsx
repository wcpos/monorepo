import * as React from 'react';
import { NavigationContainer, useLinking } from '@react-navigation/native';
import { Text } from 'react-native';
import AuthNavigator from './auth';
import SplashPage from '../pages/splash';
import useAppState from '../hooks/use-app-state';

const routes = {
	Auth: 'auth',
	Main: {
		path: '',
		screens: {
			POS: {
				path: '',
			},
			Products: {
				path: 'products',
			},
			Support: {
				path: 'support',
			},
		},
	},
};

interface AppNavigatorProps {}

const AppNavigator: React.FC<AppNavigatorProps> = ({}) => {
	const ref = React.useRef();
	const [{ user, storeDB }] = useAppState();

	const { getInitialState } = useLinking(ref, {
		prefixes: ['https://localhost:3000', 'wcpos://'],
		// prefixes: ['wcpos://'],
		config: routes,
	});

	const [isReady, setIsReady] = React.useState(false);
	const [initialState, setInitialState] = React.useState();

	React.useEffect(() => {
		getInitialState()
			.catch((e) => {
				console.error(e);
			})
			.then((state) => {
				if (state !== undefined) {
					setInitialState(state);
				}

				setIsReady(true);
			});
	}, [getInitialState]);

	if (!isReady || !user) {
		return <SplashPage />;
	}

	return (
		<NavigationContainer
			fallback={<Text>Deep link</Text>}
			initialState={initialState}
			ref={ref}
			onStateChange={(state) => console.log('New state is', state)}
		>
			<AuthNavigator />
		</NavigationContainer>
	);
};

export default AppNavigator;
