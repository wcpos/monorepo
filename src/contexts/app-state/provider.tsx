import * as React from 'react';

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
		return userDB.upsertLocal('current', {
			userID: user.uuid,
			siteID: null,
			wpCredentialsID: null,
			storeID: null,
		});
	}, [user, userDB]);

	/**
	 *
	 */
	return (
		<AppStateContext.Provider
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
			}}
		>
			{children}
		</AppStateContext.Provider>
	);
};
