import * as React from 'react';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { from, shareReplay } from 'rxjs';
import { distinctUntilChanged, tap, filter, switchMap } from 'rxjs/operators';

import { createUserDB, createStoreDB, createFastStoreDB } from '@wcpos/database';
import type {
	SiteDocument,
	StoreDatabase,
	StoreDocument,
	SyncDatabase,
	UserDatabase,
	UserDocument,
	WPCredentialsDocument,
} from '@wcpos/database';

import { isWebApp, initialProps } from './initial-props';

import type { RxState } from 'rxdb';

export interface AppStateState {
	userDB: UserDatabase;
	appState: RxState<any>;
	translationsState: RxState<any>;
	user: UserDocument;
	site: SiteDocument;
	wpCredentials: WPCredentialsDocument;
	store: StoreDocument;
	storeDB: StoreDatabase;
	fastStoreDB: SyncDatabase;
	extraData: RxState<any>;
}

export const AppStateContext = React.createContext<AppStateState | undefined>(undefined);

/**
 * UserDB Resources
 */
/**
 * NOTE: The userDB promise will be called before the app is rendered
 * - current state for logged in user, site, store, etc.
 * - translations state for language translations
 */
const userDBPromise = createUserDB().then(async (userDB) => {
	if (!userDB) {
		throw new Error('Error creating userDB');
	}
	const appState = await userDB.addState('v2');
	const translationsState = await userDB.addState('translations_v2');
	return { userDB, appState, translationsState };
});
export const userDB$ = from(userDBPromise).pipe(shareReplay(1));
const userDBResource = new ObservableResource(userDB$);

/**
 * Re-use userDB to get the user
 */
const user$ = userDB$.pipe(
	switchMap(({ userDB }) =>
		userDB.users.findOne().$.pipe(
			tap((user) => {
				if (!isRxDocument(user)) {
					userDB.users.insert({ first_name: 'Global', last_name: 'User' });
				}
			})
		)
	),
	filter((user) => isRxDocument(user)),
	distinctUntilChanged((prev, curr) => prev?.uuid === curr?.uuid)
);
const userResource = new ObservableResource(user$);

/**
 * Re-use userDB and currentState to get the other resources
 */
const storeResource$ = userDB$.pipe(
	switchMap(({ userDB, appState }) => {
		return appState.current$.pipe(
			switchMap(async (current) => {
				let site, wpCredentials, store, storeDB, fastStoreDB, extraData;
				/**
				 * Becareful! RxDB will return a value if primary ID is empty, it sucks, I hate it.
				 */
				if (current?.siteID) {
					site = await userDB.sites.findOne(current.siteID).exec();
				}
				if (current?.wpCredentialsID) {
					wpCredentials = await userDB.wp_credentials.findOne(current.wpCredentialsID).exec();
				}
				if (current?.storeID) {
					store = await userDB.stores.findOne(current.storeID).exec();
				}
				if (isRxDocument(store)) {
					storeDB = await createStoreDB(store.localID);
					fastStoreDB = await createFastStoreDB(store.localID);
					extraData = await storeDB.addState('data_v2');
				}
				return { site, wpCredentials, store, storeDB, fastStoreDB, extraData };
			})
		);
	})
);
const storeResource = new ObservableResource(storeResource$);

/**
 *
 */
export const AppStateProvider = ({ children }) => {
	const { userDB, appState, translationsState } = useObservableSuspense(userDBResource);
	const user = useObservableSuspense(userResource);
	const { site, wpCredentials, store, storeDB, fastStoreDB, extraData } =
		useObservableSuspense(storeResource);

	/**
	 *
	 */
	const login = React.useCallback(
		async ({ siteID, wpCredentialsID, storeID }) => {
			await appState.set('current', () => ({
				siteID,
				wpCredentialsID,
				storeID,
			}));
		},
		[appState]
	);

	/**
	 *
	 */
	const logout = React.useCallback(async () => {
		await appState.set('current', () => null);

		if (isWebApp) {
			window.location.href = initialProps?.logout_url;
		}
	}, [appState]);

	/**
	 *
	 */
	const switchStore = React.useCallback(
		async (store: StoreDocument) => {
			await appState.set('current', (v) => ({ ...v, storeID: store.localID }));
		},
		[appState]
	);

	const value = React.useMemo(
		() => ({
			userDB,
			appState,
			translationsState,
			user,
			site,
			wpCredentials,
			store,
			storeDB,
			fastStoreDB,
			extraData,
			login,
			logout,
			switchStore,
		}),
		[
			userDB,
			appState,
			translationsState,
			user,
			site,
			wpCredentials,
			store,
			storeDB,
			fastStoreDB,
			extraData,
			login,
			logout,
			switchStore,
		]
	);

	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export const useAppState = () => {
	const context = React.useContext(AppStateContext);
	if (!context) {
		throw new Error(`useAppState must be called within AppStateContext`);
	}

	return context;
};
