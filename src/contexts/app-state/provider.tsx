import * as React from 'react';

import { useObservableRef, ObservableResource } from 'observable-hooks';
import { isRxDatabase } from 'rxdb';
import { from } from 'rxjs';
import { distinctUntilChanged, filter } from 'rxjs/operators';

import type {
	UserDatabase,
	UserDocument,
	SiteDocument,
	WPCredentialsDocument,
	StoreDocument,
	StoreDatabase,
	SyncDatabase,
} from '@wcpos/database';

import { hydrateInitialProps, isWebApp } from './hydrate';
import { useUserDB } from './use-user-db';

export interface HydratedData {
	userDB: UserDatabase;
	user: UserDocument;
	site: SiteDocument;
	wpCredentials: WPCredentialsDocument;
	store: StoreDocument;
	storeDB: StoreDatabase;
	fastStoreDB: SyncDatabase;
	extraData: any;
}

export interface AppState extends HydratedData {
	initialProps: Readonly<Record<string, unknown>>;
	isWebApp: boolean;
	login: ({
		siteID,
		wpCredentialsID,
		storeID,
	}: {
		siteID: string;
		wpCredentialsID: string;
		storeID: string;
	}) => void;
	logout: () => void;
	switchStore: (store: StoreDocument) => void;
}

export const AppStateContext = React.createContext<AppState | undefined>(undefined);

interface AppStateProviderProps {
	children: React.ReactNode;
	initialProps: Readonly<Record<string, unknown>>;
	// isWebApp: boolean;
	// resource: ObservableResource<HydratedData>;
}

/**
 *
 */
export const AppStateProvider = ({ children, initialProps }: AppStateProviderProps) => {
	const {
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
	} = useUserDB();
	const [isReadyRef, isReady$] = useObservableRef(false);

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
			window.location.href = initialProps.logout_url;
		}
	}, [appState, initialProps.logout_url]);

	/**
	 *
	 */
	const switchStore = React.useCallback(
		async (store: StoreDocument) => {
			await appState.set('current', (v) => ({ ...v, storeID: store.localID }));
		},
		[appState]
	);

	/**
	 * Wait for bootstrap to finish
	 *
	 * @TODO - there's got to be a way to combine hydration and isReady checks
	 */
	const hydrationResource = React.useMemo(
		() =>
			new ObservableResource(from(hydrateInitialProps({ userDB, appState, user, initialProps }))),
		[
			// no dependencies, only run once on mount
		]
	);

	if (isWebApp) {
		isReadyRef.current = isRxDatabase(storeDB);
	} else {
		isReadyRef.current = true;
	}

	/**
	 *
	 */
	const value = React.useMemo(() => {
		return {
			userDB,
			user,
			site,
			wpCredentials,
			store,
			storeDB,
			fastStoreDB,
			extraData,
			translationsState,
			initialProps, // pass through initialProps
			isWebApp,
			login,
			logout,
			switchStore,
			isReadyResource: new ObservableResource(
				isReady$.pipe(
					filter((v) => v),
					distinctUntilChanged()
				)
			),
			hydrationResource,
		};
	}, [
		userDB,
		user,
		site,
		wpCredentials,
		store,
		storeDB,
		fastStoreDB,
		extraData,
		translationsState,
		initialProps,
		login,
		logout,
		switchStore,
		isReady$,
		hydrationResource,
	]);

	/**
	 *
	 */
	return (
		<AppStateContext.Provider key={store?.localID} value={value}>
			{children}
		</AppStateContext.Provider>
	);
};
