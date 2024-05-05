import * as React from 'react';
import { Linking } from 'react-native';

import {
	useObservable,
	useObservableSuspense,
	useObservableRef,
	ObservableResource,
} from 'observable-hooks';
import { isRxDatabase } from 'rxdb';
import { filter } from 'rxjs/operators';

import type {
	UserDatabase,
	UserDocument,
	SiteDocument,
	WPCredentialsDocument,
	StoreDocument,
	StoreDatabase,
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
	const { userDB, appState, translationsState, user, site, wpCredentials, store, storeDB } =
		useUserDB();

	/**
	 *
	 */
	React.useEffect(
		() => {
			hydrateInitialProps({ userDB, appState, user, initialProps });
		},
		[
			// no dependencies, run once on mount
		]
	);

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
			translationsState,
			initialProps, // pass through initialProps
			isWebApp,
			login,
			logout,
			switchStore,
		};
	}, [
		userDB,
		user,
		site,
		wpCredentials,
		store,
		storeDB,
		translationsState,
		initialProps,
		login,
		logout,
		switchStore,
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
