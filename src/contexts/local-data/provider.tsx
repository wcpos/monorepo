import * as React from 'react';

import { ObservableResource } from 'observable-hooks';
import { tap, map, switchMap } from 'rxjs/operators';

import { createStoreDB } from '@wcpos/database/src/stores-db';

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
	// @ts-ignore
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

		/**
		 * If web app, we hydrate from initial props
		 * FIXME: this feels a but messy, it probably could be improved
		 * FIXME: change in store locale will not trigger a change to language
		 */
		const hydratedResources$ = isWebApp
			? current$.pipe(
					switchMap(async ({ user, userDB }) => {
						const { site, wp_credentials, store } = initialProps;
						// @ts-ignore
						let siteDoc = await userDB.sites.findOneFix(site.uuid).exec();
						let wpCredentialsDoc = await userDB.wp_credentials
							// @ts-ignore
							.findOneFix(wp_credentials.uuid)
							.exec();
						let storeDoc = await userDB.stores.findOne({ selector: { id: store.id } }).exec();

						if (!siteDoc) {
							// @ts-ignore
							siteDoc = await userDB.sites.insert(site);
						}

						/**
						 * Update nonce for REST requests on each refresh
						 * FIXME: this should be done proactively, ie: check cookie timeout
						 */
						if (wpCredentialsDoc) {
							// @ts-ignore
							await wpCredentialsDoc.patch({ wp_nonce: wp_credentials.wp_nonce });
						}

						if (!wpCredentialsDoc) {
							// @ts-ignore
							wpCredentialsDoc = await userDB.wp_credentials.insert(wp_credentials);
						}

						if (!storeDoc) {
							// @ts-ignore
							storeDoc = await userDB.stores.insert(store);
						}

						const storeDB = await createStoreDB(storeDoc.localID);

						return {
							user,
							userDB,
							site: siteDoc,
							wpCredentials: wpCredentialsDoc,
							store: storeDoc,
							storeDB,
						};
					})
			  )
			: current$;

		/**
		 *
		 */
		return {
			// @ts-ignore
			resources: new ObservableResource(hydratedResources$),
			isWebApp,
			initialProps,
		};
	}, [initialProps]);

	return <LocalDataContext.Provider value={value}>{children}</LocalDataContext.Provider>;
};
