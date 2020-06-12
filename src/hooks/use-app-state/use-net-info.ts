import React from 'react';
import NetInfo from '@react-native-community/netinfo';
import { IS_ONLINE } from './consts';

type AppState = import('./app-state-provider').AppState;
type AppAction = import('./app-state-provider').AppAction;

const useNetInfo = (appState: AppState, dispatch: React.Dispatch<AppAction>): void => {
	React.useEffect(() => {
		return NetInfo.addEventListener(({ isConnected }) => {
			if (appState.online !== isConnected) {
				dispatch({ type: IS_ONLINE, payload: { online: isConnected } });
			}
		});
	}, [dispatch, appState.online]);
};

export default useNetInfo;
