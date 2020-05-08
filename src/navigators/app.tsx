import * as React from 'react';
import { NavigationContainer, useLinking } from '@react-navigation/native';
import AuthNavigator from './auth';

interface AppNavigatorProps {}

const AppNavigator: React.FC<AppNavigatorProps> = ({}) => {
	const ref = React.useRef();

	const { getInitialState } = useLinking(ref, {
		prefixes: ['wcpos://'],
		config: {
			Products: 'products',
			Support: 'support',
		},
		getPathFromState(state, config) {},
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
