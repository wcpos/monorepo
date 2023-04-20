import * as React from 'react';

import pick from 'lodash/pick';
import { ObservableResource } from 'observable-hooks';
import { tap, map, switchMap } from 'rxjs/operators';

import { createStoreDB } from '@wcpos/database/src/stores-db';

import { current$, hydrateWebAppData } from './observables';

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
		const { site, wp_credentials, store } = pick(initialProps, ['site', 'wp_credentials', 'store']);
		const isWebApp = Boolean(site && wp_credentials && store);

		/**
		 * If web app, we hydrate from initial props
		 * FIXME: this feels a but messy, it probably could be improved
		 * FIXME: change in store locale will not trigger a change to language
		 */
		const hydratedResources$ = isWebApp ? hydrateWebAppData(site, wp_credentials, store) : current$;

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
