import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { tap, map } from 'rxjs/operators';

import { combined$ } from './observables';

type UserDocument = import('@wcpos/database').UserDocument;
type UserDatabase = import('@wcpos/database').UserDatabase;
type StoreDatabase = import('@wcpos/database').StoreDatabase;
type StoreDocument = import('@wcpos/database').StoreDocument;
type SiteDocument = import('@wcpos/database').SiteDocument;
type WPCredentialsDocument = import('@wcpos/database').WPCredentialsDocument;

export interface LocalData {
	userDB: UserDatabase;
	user: UserDocument;
	site?: SiteDocument;
	wpCredentials?: WPCredentialsDocument;
	store?: StoreDocument;
	storeDB?: StoreDatabase;
	locale: string;
}

export const LocalDataContext = React.createContext<{
	localResources: ObservableResource<LocalData>;
}>(null);

interface LocalDataProviderProps {
	children: React.ReactNode;
	initialProps: import('../../types').InitialProps;
}

let count = 0;

/**
 * The Local Data Provider composes all bunch of local resource observables
 * Ideally, this should only emit once on start up, and then for rare events such as
 * - login
 * - logout
 * - change store
 * - change language
 */
export const LocalDataProvider = ({ children, initialProps }: LocalDataProviderProps) => {
	/**
	 * Web app hydration
	 */

	/**
	 *
	 */
	const value = React.useMemo(() => {
		const isWebApp = !!(initialProps && initialProps.site);

		const allLocalResources$ = combined$.pipe(
			map(([userDB, user, site, wpCredentials, store, storeDB, locale]) => {
				return {
					userDB,
					user,
					site,
					wpCredentials,
					store,
					storeDB,
					locale,
					isWebApp,
					initialProps,
				};
			}),
			tap(async ({ user, userDB, storeDB }) => {
				/**
				 * Hydrate initialProps for web app
				 * TODO - This is a bit hacky, probably can be improved
				 */
				if (user && isWebApp && count === 0) {
					count++;
					const { site, wp_credentials, store } = initialProps;
					await user.update({
						$push: {
							sites: {
								...site,
								wp_credentials: [{ ...wp_credentials, stores: [store] }],
							},
						},
					});
					const storeDoc = await userDB.stores.findOneFix({ selector: { id: store.id } }).exec();
					userDB.upsertLocal('current', {
						userID: user.uuid,
						siteID: site.uuid,
						wpCredentialsID: wp_credentials.uuid,
						storeID: storeDoc.localID,
					});
				}
			})
		);

		/**
		 * localResources should emit
		 * - userDB
		 * - user (global POS user, not the store user)
		 * - logged in details (site, wpCredentials, store)
		 * - storeDB
		 * - translations (just the locale will do)
		 */
		return {
			localResources: new ObservableResource(allLocalResources$),
		};
	}, [initialProps]);

	return <LocalDataContext.Provider value={value}>{children}</LocalDataContext.Provider>;
};
