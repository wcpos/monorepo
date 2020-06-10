import * as React from 'react';
import { NavigationContainer, useLinking } from '@react-navigation/native';
import { Text } from 'react-native';
import AuthNavigator from './auth';

interface AppNavigatorProps {}

const AppNavigator: React.FC<AppNavigatorProps> = ({}) => {
	const ref = React.useRef();

	const { getInitialState } = useLinking(ref, {
		prefixes: ['https://localhost', 'wcpos://'],
		// prefixes: ['wcpos://'],
		config: {
			Auth: 'auth',
			Main: {
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
	});

	const [isReady, setIsReady] = React.useState(false);
	const [initialState, setInitialState] = React.useState();

	React.useEffect(() => {
		getInitialState()
			.catch(() => {})
			.then((state) => {
				if (state !== undefined) {
					setInitialState(state);
				}

				setIsReady(true);
			});
	}, [getInitialState]);

	if (!isReady) {
		return null;
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
