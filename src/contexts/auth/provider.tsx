import * as React from 'react';

import find from 'lodash/find';
import { useObservableSuspense, ObservableResource, useObservableState } from 'observable-hooks';
import { from } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import { userDBPromise } from '@wcpos/database/src/users-db';
import log from '@wcpos/utils/src/logger';

import { selectedResource } from './resources';
import { userDBResource, userResource } from './user-resource';

export const AuthContext = React.createContext<any>(null);

interface AuthProviderProps {
	children: React.ReactNode;
	initialProps: import('../../types').InitialProps;
}

/**
 *
 */
export const AuthProvider = ({ children, initialProps }: AuthProviderProps) => {
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
	 * site, wpCredentials, store is provided by initialProps, ie: WebApp
	 */
	React.useEffect(() => {
		const hydrateInitialProps = async (site) => {
			await user.update({ $push: { sites: site } });

			// return login({
			// 	siteID: siteDoc.localID,
			// 	wpCredentialsID: wpCredentialsDoc.localID,
			// 	storeID: storeDoc.localID,
			// });
		};

		if (initialProps && initialProps.site) {
			hydrateInitialProps(initialProps.site);
		}
	}, [initialProps, user]);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		// const storeDBResource =
		// 	store?.localID && new ObservableResource(from(storeDBPromise(store.localID)));

		return {
			userDB,
			user,
			site,
			wpCredentials,
			store,
			login,
			logout,
			// storeDBResource,
		};
	}, [userDB, login, logout, site, store, user, wpCredentials]);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
