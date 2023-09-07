import * as React from 'react';
import { Linking } from 'react-native';

import { useObservableSuspense } from 'observable-hooks';

import type {
	UserDatabase,
	UserDocument,
	SiteDocument,
	WPCredentialsDocument,
	StoreDocument,
	StoreDatabase,
} from '@wcpos/database';

import { initialProps, isWebApp, resource, initialPropsSubject } from '../../hydrate-data';

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
	switchStore: (store: StoreDocument) => void;
}

export const AppStateContext = React.createContext<AppState | undefined>(undefined);

interface AppStateProviderProps {
	children: React.ReactNode;
	// initialProps?: import('../../types').InitialProps;
	// isWebApp: boolean;
	// resource: ObservableResource<HydratedData>;
}

/**
 *
 */
export const AppStateProvider = ({ children }: AppStateProviderProps) => {
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
	}, [user?.uuid, userDB]);

	/**
	 *
	 */
	const switchStore = React.useCallback(
		async (store) => {
			if (isWebApp) {
				/**
				 * This is super messy, I need to refactor the web store switching
				 * ... but it works for now
				 */
				initialPropsSubject.next({ ...initialProps, store_id: store.id });
				return;
			}
			return login({
				siteID: site.uuid,
				wpCredentialsID: wpCredentials.uuid,
				storeID: store.localID,
			});
		},
		[login, site?.uuid, wpCredentials?.uuid]
	);

	/**
	 *
	 */
	React.useEffect(() => {
		// Perform any required setup here...
		return () => {
			// Perform any cleanup here...
			if (storeDB) {
				// free up memory is the storeDB changes
				storeDB.destroy();
			}
		};
	}, [storeDB]);

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
