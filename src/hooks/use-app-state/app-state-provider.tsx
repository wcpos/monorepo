import React from 'react';
import { Dimensions } from 'react-native';
import { getUniqueId, getReadableVersion } from './device-info';
import useNetInfo from './use-net-info';
import useDimensions from './use-dimensions';
import useDatabase from './use-database';
import * as actionTypes from './action-types';

export type AppState = {
	online: boolean;
	window: import('react-native').ScaledSize;
	screen: import('react-native').ScaledSize;
	info: {
		uniqueId: string;
		version: string;
	};
	urlPrefix: string;
	user?: any;
	storeDB?: any;
	site?: any;
	wpUser?: any;
};
export type ActionTypes = typeof actionTypes;
export type AppAction = {
	type: Extract<keyof typeof actionTypes, string>;
	payload?: any;
};

const initialState: AppState = {
	online: false,
	window: Dimensions.get('window'),
	screen: Dimensions.get('screen'),
	info: {
		uniqueId: getUniqueId(),
		version: getReadableVersion(),
	},
	urlPrefix: window?.location?.origin || 'wcpos://',
	user: undefined,
	storeDB: undefined,
	site: undefined,
	wpUser: undefined,
};

function appStateReducer(state: AppState, action: AppAction): AppState {
	const { type, payload } = action;
	console.log(type, payload);
	switch (type) {
		// case consts.DIMENSIONS_CHANGE:
		// 	return { ...state, ...payload };
		// case consts.IS_ONLINE:
		// 	return { ...state, ...payload };
		// case SET_THEME:
		// 	return { ...state, colorTheme: action.theme };
		case actionTypes.SET_STORE:
			return state;
		default:
			return { ...state, ...payload };
	}
}

export const AppStateContext = React.createContext<
	[AppState, React.Dispatch<AppAction>, ActionTypes]
>(null);

const AppStateProvider: React.FC = ({ children }) => {
	const [state, dispatch] = React.useReducer(appStateReducer, initialState);
	const value = React.useMemo(() => [state, dispatch, actionTypes], [state]) as any;

	useNetInfo(state, dispatch);
	useDimensions(dispatch);
	useDatabase(dispatch);

	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export default AppStateProvider;
