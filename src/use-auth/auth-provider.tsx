import * as React from 'react';
import { from } from 'rxjs';
import { useObservableSuspense, ObservableResource } from 'observable-hooks';
import { storeDBPromise } from '@wcpos/database/src/stores-db';
import { userDBResource, userResource, selectedResource } from './resources';

export const AuthContext = React.createContext<any>(null);

interface AuthProviderProps {
	children: React.ReactNode;
}

/**
 *
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
	const userDB = useObservableSuspense(userDBResource);
	const user = useObservableSuspense(userResource);
	const { site, wpCredentials, store } = useObservableSuspense(selectedResource);

	/**
	 *
	 */
	const login = React.useCallback(
		async ({ siteID, wpCredentialsID, storeID }) => {
			const current = await userDB.getLocal('current');
			await userDB.upsertLocal('current', {
				userID: current && current.get('userID'),
				siteID,
				wpCredentialsID,
				storeID,
			});
		},
		[userDB]
	);

	/**
	 *
	 */
	const logout = React.useCallback(async () => {
		const current = await userDB.getLocal('current');
		return userDB.upsertLocal('current', {
			userID: current && current.get('userID'),
		});
	}, [userDB]);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		const storeDBResource =
			store?.localID && new ObservableResource(from(storeDBPromise(store.localID)));

		return {
			userDB,
			user,
			site,
			wpCredentials,
			store,
			login,
			logout,
			storeDBResource,
		};
	}, [userDB, login, logout, site, store, user, wpCredentials]);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
