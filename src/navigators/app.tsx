import * as React from 'react';
import { NavigationContainer, useLinking } from '@react-navigation/native';
import { Text } from 'react-native';
import AuthNavigator from './auth';
import SplashPage from '../pages/splash';
import useAppState from '../hooks/use-app-state';

const routes = {
	Auth: 'connect',
	Main: {
		path: '',
		screens: {
			POS: {
				path: '',
			},
			Products: {
				path: 'products',
			},
			Orders: {
				path: 'orders',
			},
			Customers: {
				path: 'customers',
			},
			Support: {
				path: 'support',
			},
		},
	},
};

const AppNavigator = (): React.ReactElement => {
	const ref: React.Ref<any> = React.useRef();
	const [{ user, urlPrefix }] = useAppState();

	const { getInitialState } = useLinking(ref, {
		prefixes: [urlPrefix],
		config: { screens: routes },
	});

	const [isReady, setIsReady] = React.useState(false);
	const [initialState, setInitialState] = React.useState();

	React.useEffect(() => {
		(async () => {
			try {
				const state = await getInitialState();
				if (state !== undefined) {
					// @ts-ignore
					setInitialState(state);
				}
			} catch (e) {
				console.warn(e);
			} finally {
				setIsReady(true);
			}
		})();
	}, [getInitialState]);

	if (!isReady || !user) {
		return <SplashPage />;
	}

	return (
		<NavigationContainer
			// fallback={<Text>Deep link</Text>}
			initialState={initialState}
			ref={ref}
			onStateChange={(state) => {
				console.log('New nav state', JSON.stringify(state, null, 2));
			}}
		>
			<AuthNavigator />
		</NavigationContainer>
	);
};

export default AppNavigator;
