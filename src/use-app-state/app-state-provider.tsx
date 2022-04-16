import * as React from 'react';
import { combineLatest, of } from 'rxjs';
import { tap, switchMap, map, filter, debounceTime } from 'rxjs/operators';
import { ObservableResource, useObservableSuspense, useObservableState } from 'observable-hooks';
import { userDBResource, authResources, storeDBResource } from './resources';

type InitialProps = import('@wcpos/core/src/types').InitialProps;
type SiteDocument = import('@wcpos/database').SiteDocument;
type StoreDatabase = import('@wcpos/database').StoreDatabase;
type StoreDocument = import('@wcpos/database').StoreDocument;
type UserDatabase = import('@wcpos/database').UserDatabase;
type UserDocument = import('@wcpos/database').UserDocument;
type WPCredentialsDocument = import('@wcpos/database').WPCredentialsDocument;

export interface AppStateProps {
	initialProps: InitialProps;
	userDB: UserDatabase;
	user: UserDocument;
	site?: SiteDocument;
	wpCredentials?: WPCredentialsDocument;
	store?: StoreDocument;
	storeDB?: StoreDatabase;
}

export const AppStateContext = React.createContext<unknown>({}) as React.Context<AppStateProps>;

interface AppStatePropviderProps {
	children: React.ReactNode;
	initialProps: InitialProps;
}

/**
 * App State Provider
 */
const AppStateProvider = ({ children, initialProps }: AppStatePropviderProps) => {
	const userDB = useObservableSuspense(userDBResource);
	const storeDB = useObservableSuspense(storeDBResource);
	const [user, site, wpCredentials, store] = useObservableSuspense(authResources);

	// web app
	// React.useEffect(() => {

	// }, [])

	/**
	 * These values values should be relatively static
	 * Any change will cause the entire app to re-render
	 */
	const value = React.useMemo(
		() => ({
			initialProps: Object.freeze(initialProps), // prevent accidental mutation
			userDB,
			user,
			site,
			wpCredentials,
			store,
			storeDB,
		}),
		[initialProps, site, store, storeDB, user, userDB, wpCredentials]
	);

	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export default AppStateProvider;
