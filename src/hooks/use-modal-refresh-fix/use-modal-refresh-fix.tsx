import * as React from 'react';
import { useWindowDimensions } from 'react-native';

import { useNavigation, CommonActions } from '@react-navigation/native';

/**
 * If modal is the only one in stack (ie: page refresh), then reset navigation with a sensible stack
 * TODO - is there a better way to do this?
 */
export const useModalRefreshFix = () => {
	const navigation = useNavigation();
	const dimensions = useWindowDimensions();
	React.useEffect(() => {
		const state = navigation.getState();
		if (state.routes.length === 1) {
			/** I need to get the orderID also */
			const params = state.routes[0].params;
			navigation.dispatch(() => {
				return CommonActions.reset({
					...state,
					routes: [{ name: state.routeNames[0], params }, ...state.routes],
					index: 1,
				});
			});
		}
	}, [
		navigation,
		dimensions, // NOTE - the right routes will depend on the screen size
	]);
};
