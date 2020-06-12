import React from 'react';
import { Dimensions } from 'react-native';
import useNetInfo from './use-net-info';
import useDimensions from './use-dimensions';
import * as consts from './consts';

const initialState = {
	online: false, // optimistic?
	window: Dimensions.get('window'),
	screen: Dimensions.get('screen'),
};

export type AppState = typeof initialState;
export type AppAction = {
	type: Extract<keyof typeof consts, string>;
	payload: any;
};

function appStateReducer(state: AppState, action: AppAction): AppState {
	const { type, payload } = action;
	switch (type) {
		case consts.DIMENSIONS_CHANGE:
			return { ...state, ...payload };
		case consts.IS_ONLINE:
			return { ...state, ...payload };
		// case SET_THEME:
		// 	return { ...state, colorTheme: action.theme };
		default:
			return state;
	}
}

export const AppStateContext = React.createContext<[AppState, React.Dispatch<AppAction>]>(null);

const AppStateProvider: React.FC = ({ children }) => {
	const [state, dispatch] = React.useReducer(appStateReducer, initialState);
	const value = React.useMemo(() => [state, dispatch], [state]) as any;

	useNetInfo(state, dispatch);
	useDimensions(dispatch);

	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export default AppStateProvider;
