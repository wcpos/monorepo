import * as React from 'react';

import get from 'lodash/get';
import pick from 'lodash/pick';
import { ObservableResource } from 'observable-hooks';
import { tap, map, switchMap } from 'rxjs/operators';

import { current$, hydrateWebAppData, hydrateTranslations } from './observables';

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

type InitialProps = import('../../types').InitialProps;

export const LocalDataContext = React.createContext<{
	resources: ObservableResource<LocalData>;
	isWebApp: boolean;
	initialProps: InitialProps;
	// @ts-ignore
}>(null);

interface LocalDataProviderProps {
	children: React.ReactNode;
	initialProps: InitialProps;
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
		const { site, wp_credentials, stores, store, store_id } = pick(initialProps, [
			'site',
			'wp_credentials',
			'stores',
			'store',
			'store_id',
		]);

		/**
		 * Hack fix for backwards compatibility, remove after v1 release
		 */
		const _stores = stores || [store];
		const isWebApp = Boolean(site && wp_credentials && _stores);

		/**
		 * If web app, we hydrate from initial props
		 * FIXME: this feels a but messy, it probably could be improved
		 * FIXME: change in store locale will not trigger a change to language
		 */
		const hydratedResources$ = isWebApp
			? hydrateWebAppData(site, wp_credentials, _stores, store_id)
			: current$;

		/**
		 * Subscribe to locale changes in the current store and add locale to the local data
		 */
		const resources$ = hydratedResources$.pipe(
			switchMap(({ user, userDB, site, wpCredentials, store, storeDB }) => {
				const localeSetting$ = store?.locale$ || user.locale$;
				return hydrateTranslations(localeSetting$, userDB).pipe(
					map((locale) => ({
						user,
						userDB,
						site,
						wpCredentials,
						store,
						storeDB,
						locale,
					}))
				);
			})
		);

		/**
		 *
		 */
		return {
			// @ts-ignore
			resources: new ObservableResource(resources$),
			isWebApp,
			initialProps,
		};
	}, [initialProps]);

	return <LocalDataContext.Provider value={value}>{children}</LocalDataContext.Provider>;
};
