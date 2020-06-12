import React from 'react';
import { Dimensions } from 'react-native';
import debounce from 'lodash/debounce';
import { DIMENSIONS_CHANGE } from './action-types';

type AppState = import('./app-state-provider').AppState;
type AppAction = import('./app-state-provider').AppAction;
type PayloadProps = Pick<AppState, 'window' | 'screen'>;

const useDimensions = (dispatch: React.Dispatch<AppAction>): void => {
	// @TODO why useMemo?
	// const onChange = debounce(({ window, screen }: { window: ScaledSize; screen: ScaledSize }) => {
	// 	dispatch({ type: DIMENSIONS_CHANGE, payload: { window, screen } });
	// }, 250);

	const onChange = React.useMemo(() => {
		return debounce(({ window, screen }: PayloadProps) => {
			dispatch({ type: DIMENSIONS_CHANGE, payload: { window, screen } });
		}, 250);
	}, [dispatch]);

	React.useEffect(() => {
		Dimensions.addEventListener('change', onChange);
		return () => {
			Dimensions.removeEventListener('change', onChange);
		};
	});
};

export default useDimensions;
