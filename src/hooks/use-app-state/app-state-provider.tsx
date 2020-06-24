import React from 'react';
import { Dimensions } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import debounce from 'lodash/debounce';
import { getUniqueId, getReadableVersion } from './device-info';
import database from '../../database';
import * as actionTypes from './action-types';
import logger from '../../services/logger';

type AppState = {
	online: boolean;
	window: import('react-native').ScaledSize;
	screen: import('react-native').ScaledSize;
	info: {
		uniqueId: string;
		version: string;
	};
	urlPrefix: string;
	appUser?: any;
	store?: any;
	// storeDB?: any;
	// site?: any;
	// wpUser?: any;
};
type AppAction = { type: Extract<keyof typeof actionTypes, string>; payload?: any };
type ActionTypes = typeof actionTypes;
type ContextValue = [AppState, React.Dispatch<AppAction>, ActionTypes];

/**
 * Initial App State
 */
const initialState: AppState = {
	online: false,
	window: Dimensions.get('window'),
	screen: Dimensions.get('screen'),
	info: {
		uniqueId: getUniqueId(),
		version: getReadableVersion(),
	},
	urlPrefix: window?.location?.origin || 'wcpos://',
	appUser: undefined,
	store: undefined,
	// storeDB: undefined,
	// site: undefined,
	// wpUser: undefined,
};

/**
 * Local storage helpers
 */
const getLastStore = async () => database.adapter.getLocal('last_store');
const setLastStore = async (storeId: string) => database.adapter.setLocal('last_store', storeId);
const removeLastStore = async () => database.adapter.removeLocal('last_store');

/**
 * App State reducer
 * @param state Global shared state
 * @param action Reducer actions
 */
function appStateReducer(state: AppState, action: AppAction): AppState {
	const { type, payload } = action;
	// logger.info(type, payload);
	logger.error('test');
	switch (type) {
		// case consts.DIMENSIONS_CHANGE:
		// 	return { ...state, ...payload };
		// case consts.IS_ONLINE:
		// 	return { ...state, ...payload };
		// case SET_THEME:
		// 	return { ...state, colorTheme: action.theme };
		case actionTypes.STORE_LOGOUT:
			removeLastStore();
			return { ...state, store: undefined };
		case actionTypes.SET_STORE:
			setLastStore(payload.store.id);
			return { ...state, ...payload };
		default:
			return { ...state, ...payload };
	}
}

export const AppStateContext = React.createContext<ContextValue>(null);

/**
 * The Provider
 */
const AppStateProvider: React.FC = ({ children }) => {
	const [state, dispatch] = React.useReducer(appStateReducer, initialState);
	const value: ContextValue = React.useMemo(() => [state, dispatch, actionTypes], [state]) as any;

	/**
	 * Listen to internet connection
	 */
	React.useEffect(() => {
		return NetInfo.addEventListener(({ isConnected }) => {
			if (state.online !== isConnected) {
				dispatch({ type: actionTypes.IS_ONLINE, payload: { online: isConnected } });
			}
		});
	}, [dispatch, state.online]);

	/**
	 * Listen to screen size
	 */
	// @TODO possibly move this a ui focused context
	// @TODO why useMemo?
	// const onChange = debounce(({ window, screen }: { window: ScaledSize; screen: ScaledSize }) => {
	// 	dispatch({ type: DIMENSIONS_CHANGE, payload: { window, screen } });
	// }, 250);
	const onChange = React.useMemo(() => {
		return debounce(({ window, screen }: Pick<AppState, 'window' | 'screen'>) => {
			dispatch({ type: actionTypes.DIMENSIONS_CHANGE, payload: { window, screen } });
		}, 250);
	}, [dispatch]);

	React.useEffect(() => {
		Dimensions.addEventListener('change', onChange);
		return () => {
			Dimensions.removeEventListener('change', onChange);
		};
	});

	/**
	 * Init database
	 */
	React.useEffect(() => {
		(async function init() {
			const appUsersCollection = database.collections.get('app_users');
			const storesCollection = database.collections.get('stores');
			const lastStore = await getLastStore();

			if (!lastStore) {
				const appUserCount = await appUsersCollection.query().fetchCount();

				if (appUserCount === 0) {
					// create new user
					await database.action(async () => {
						const newUser = await appUsersCollection.create((user) => {
							user.display_name = 'New User';
						});
						dispatch({ type: actionTypes.SET_USER, payload: { appUser: newUser } });
					});
				}

				if (appUserCount === 1) {
					// set only user
					const allUsers = await appUsersCollection.query().fetch();
					dispatch({ type: actionTypes.SET_USER, payload: { appUser: allUsers[0] } });
				}

				if (appUserCount > 0) {
					debugger;
				}
			} else {
				const store = await storesCollection.find(lastStore);
				const appUser = await appUsersCollection.find(store.app_user.id);
				dispatch({ type: actionTypes.SET_STORE, payload: { appUser, store } });
			}
		})();
	}, [dispatch]);

	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export default AppStateProvider;
