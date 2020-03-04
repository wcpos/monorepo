import * as React from 'react';
import { NavigationContainer, useLinking } from '@react-navigation/native';
import AuthNavigator from './auth';

interface AppNavigatorProps {}

const AppNavigator: React.FC<AppNavigatorProps> = ({}) => {
	const ref = React.useRef();

	const { getInitialState } = useLinking(ref, {
		prefixes: ['https://client.wcpos.com', 'wcpos://'],
		config: {
			Auth: 'auth',
			POS: 'pos',
			Cart: 'cart',
			Products: 'products',
		},
	});

	const [isReady, setIsReady] = React.useState(false);
	const [initialState, setInitialState] = React.useState();

	React.useEffect(() => {
		Promise.race([
			getInitialState(),
			new Promise(resolve =>
				// Timeout in 150ms if `getInitialState` doesn't resolve
				// Workaround for https://github.com/facebook/react-native/issues/25675
				setTimeout(resolve, 150)
			),
		])
			.catch(e => {
				console.error(e);
			})
			.then(state => {
				if (state !== undefined) {
					console.log(state);
					setInitialState(state);
				}

				setIsReady(true);
			});
	}, [getInitialState]);

	if (!isReady) {
		return null;
	}

	return (
		<NavigationContainer initialState={initialState} ref={ref}>
			<AuthNavigator />
		</NavigationContainer>
	);
};

export default AppNavigator;
