import * as React from 'react';
import { NavigationContainer, useLinking } from '@react-navigation/native';
import AuthNavigator from './auth';

interface AppNavigatorProps {}

const AppNavigator: React.FC<AppNavigatorProps> = ({}) => {
	const ref = React.useRef();

	const { getInitialState } = useLinking(ref, {
		prefixes: ['wcpos://'],
		config: {
			Splash: 'loading',
			Auth: 'auth',
			POS: '',
			Products: 'products',
			Support: 'support',
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
		<NavigationContainer initialState={initialState} ref={ref}>
			<AuthNavigator />
		</NavigationContainer>
	);
};

export default AppNavigator;
