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
	switch (type) {
		// case consts.DIMENSIONS_CHANGE:
		// 	return { ...state, ...payload };
		// case consts.IS_ONLINE:
		// 	return { ...state, ...payload };
		// case SET_THEME:
		// 	return { ...state, colorTheme: action.theme };
		case actionTypes.SET_USER:
			logger.debug('Set app user', payload.toJSON());
			return { ...state, appUser: payload };
		case actionTypes.STORE_LOGOUT:
			removeLastStore();
			return { ...state, store: undefined };
		case actionTypes.SET_STORE:
			// setLastStore(payload.store.id);
			payload.store.collection.upsertLocal('last_store', { store_id: payload.store.id });
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
	const [userDatabase, setUserDatabase] = React.useState();
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
			const db = await database;
			setUserDatabase(db);
		})();
	}, []);

	React.useEffect(() => {
		(async function init() {
			if (userDatabase) {
				const lastStore = await userDatabase.collections.stores.getLocal('last_store');

				if (!lastStore) {
					const appUsers = await userDatabase.collections.app_users.find().exec();

					if (appUsers.length === 0) {
						// create new user
						logger.debug('No app user found');
						const newUser = await userDatabase.collections.app_users.createNewUser();
						dispatch({ type: actionTypes.SET_USER, payload: newUser });
					}

					if (appUsers.length === 1) {
						// set only user
						dispatch({ type: actionTypes.SET_USER, payload: appUsers[0] });
					}

					if (appUsers.length > 1) {
						// multiple users
					}
				} else {
					const store = await userDatabase.collections.stores
						.findOne(lastStore.get('store_id'))
						.exec();

					const appUser = await userDatabase.collections.app_users.findOne('new-0').exec();

					dispatch({ type: actionTypes.SET_STORE, payload: { appUser, store } });
				}
			}
		})();
	}, [userDatabase]);

	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export default AppStateProvider;
