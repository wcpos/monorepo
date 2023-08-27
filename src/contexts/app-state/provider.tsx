import * as React from 'react';
import { Linking } from 'react-native';

import { ObservableResource, useObservableSuspense } from 'observable-hooks';

import type {
	UserDatabase,
	UserDocument,
	SiteDocument,
	WPCredentialsDocument,
	StoreDocument,
	StoreDatabase,
} from '@wcpos/database';

export interface HydratedData {
	userDB: UserDatabase;
	user: UserDocument;
	site: SiteDocument;
	wpCredentials: WPCredentialsDocument;
	store: StoreDocument;
	storeDB: StoreDatabase;
}

export interface AppState extends HydratedData {
	initialProps: import('../../types').InitialProps;
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
	switchStore: (storeID: string) => void;
}

export const AppStateContext = React.createContext<AppState | undefined>(undefined);

interface AppStateProviderProps {
	children: React.ReactNode;
	initialProps?: import('../../types').InitialProps;
	isWebApp: boolean;
	resource: ObservableResource<HydratedData>;
}

/**
 *
 */
export const AppStateProvider = ({
	children,
	initialProps,
	resource,
	isWebApp,
}: AppStateProviderProps) => {
	const { userDB, user, site, wpCredentials, store, storeDB } = useObservableSuspense(resource);

	/**
	 *
	 */
	const login = React.useCallback(
		async ({ siteID, wpCredentialsID, storeID }) => {
			return userDB.upsertLocal('current', {
				userID: user.uuid,
				siteID,
				wpCredentialsID,
				storeID,
			});
		},
		[user, userDB]
	);

	/**
	 *
	 */
	const logout = React.useCallback(async () => {
		if (isWebApp) {
			Linking.openURL(initialProps.logout_url);
			return;
		}
		return userDB.upsertLocal('current', {
			userID: user.uuid,
			siteID: null,
			wpCredentialsID: null,
			storeID: null,
		});
	}, [initialProps?.logout_url, isWebApp, user?.uuid, userDB]);

	/**
	 *
	 */
	const switchStore = React.useCallback(
		async (storeID) => {
			if (isWebApp) {
				// TODO - need to trigger the web hydration with new storeID
				debugger;
				return;
			}
			return login({
				siteID: site.uuid,
				wpCredentialsID: wpCredentials.uuid,
				storeID,
			});
		},
		[isWebApp, login, site?.uuid, wpCredentials?.uuid]
	);

	/**
	 *
	 */
	return (
		<AppStateContext.Provider
			key={store?.localID}
			value={{
				initialProps, // pass down initialProps
				isWebApp,
				userDB,
				user,
				site,
				wpCredentials,
				store,
				storeDB,
				login,
				logout,
				switchStore,
			}}
		>
			{children}
		</AppStateContext.Provider>
	);
};
