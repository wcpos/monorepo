import * as React from 'react';
import { of } from 'rxjs';
import { tap, switchMap } from 'rxjs/operators';
import { userDB$ } from '@wcpos/common/src/database/users-db';
import { ObservableResource, useObservableSuspense, useObservableState } from 'observable-hooks';
import get from 'lodash/get';
import {
	getResource,
	// 	getUserResource,
	// 	getSiteResource,
	// 	getWpCredResource,
	// 	getStoreResource,
	// 	getStoreDBResource,
} from './resources';

type InitialProps = import('@wcpos/common/src//types').InitialProps;
type SiteDocument = import('@wcpos/common/src/database').SiteDocument;
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
type StoreDocument = import('@wcpos/common/src/database').StoreDocument;
type UserDatabase = import('@wcpos/common/src/database').UserDatabase;
type UserDocument = import('@wcpos/common/src/database').UserDocument;
type WPCredentialsDocument = import('@wcpos/common/src/database').WPCredentialsDocument;

export interface AppStateProps {
	userDB: UserDatabase;
	resources: ObservableResource<{
		user: UserDocument;
		site: SiteDocument;
		wpCredentials: WPCredentialsDocument;
		store: StoreDocument;
		storeDB: StoreDatabase;
	}>;
	online: boolean;
}

export const AppStateContext = React.createContext<unknown>({}) as React.Context<AppStateProps>;

interface AppStatePropviderProps {
	children: React.ReactNode;
	initialProps: InitialProps;
}

const userDBResource = new ObservableResource(userDB$, (value: any) => !!value);

/**
 * App State Provider
 */
const AppStateProvider = ({ children, initialProps }: AppStatePropviderProps) => {
	const userDB = useObservableSuspense(userDBResource);

	/**
	 * These values values should be relatively static
	 * Any change will cause the entire app to re-render
	 */
	const value = {
		initialProps: Object.freeze(initialProps), // prevent accidental mutation
		online: true,
		resources: getResource(userDB, initialProps),
	};

	// @ts-ignore
	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export default AppStateProvider;
