import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { tap, map } from 'rxjs/operators';

import { current$ } from './observables';

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
	resources: ObservableResource<LocalData>;
}>(null);

interface LocalDataProviderProps {
	children: React.ReactNode;
	initialProps: import('../../types').InitialProps;
}

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
	 *
	 */
	const value = React.useMemo(() => {
		const isWebApp = !!(initialProps && initialProps.site);

		const hydratedResources$ = current$.pipe(
			map((current) => {
				return {
					...current,
					isWebApp,
					initialProps,
				};
			}),
			tap(async ({ user, userDB, storeDB }) => {
				/**
				 * Hydrate initialProps for web app
				 */
				if (user && isWebApp && !storeDB) {
					const { site, wp_credentials, store } = initialProps;
					let siteDoc = await userDB.sites.findOneFix(site.uuid).exec();
					let wpCredentialsDoc = await userDB.wp_credentials.findOneFix(wp_credentials.uuid).exec();
					let storeDoc = await userDB.stores.findOne({ selector: { id: store.id } }).exec();

					if (!siteDoc) {
						siteDoc = await userDB.sites.insert(site);
					}

					/**
					 * Update nonce for REST requests on each refresh
					 * FIXME: this should be done proactively, ie: check cookie timeout
					 */
					if (wpCredentialsDoc) {
						await wpCredentialsDoc.patch({ wp_nonce: wp_credentials.wp_nonce });
					}

					if (!wpCredentialsDoc) {
						wpCredentialsDoc = await userDB.wp_credentials.insert(wp_credentials);
					}

					if (!storeDoc) {
						storeDoc = await userDB.stores.insert(store);
					}

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
		 *
		 */
		return {
			resources: new ObservableResource(hydratedResources$),
		};
	}, [initialProps]);

	return <LocalDataContext.Provider value={value}>{children}</LocalDataContext.Provider>;
};
