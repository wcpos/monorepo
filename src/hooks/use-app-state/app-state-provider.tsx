import * as React from 'react';
import { userDB$ } from '@wcpos/common/src/database/users-db';
import { ObservableResource, useObservableSuspense } from 'observable-hooks';
import get from 'lodash/get';
import {
	getUserResource,
	getSiteResource,
	getWpCredResource,
	getStoreResource,
	getStoreDBResource,
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
	userResource: ObservableResource<UserDocument>;
	siteResource: ObservableResource<SiteDocument>;
	wpCredResource: ObservableResource<WPCredentialsDocument>;
	storeResource: ObservableResource<StoreDocument>;
	storeDBResource: ObservableResource<StoreDatabase>;
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
	const userResource = getUserResource(userDB);
	const siteResource = getSiteResource(userDB, get(initialProps, 'site'));
	const wpCredResource = getWpCredResource(userDB, get(initialProps, 'wpCredentials'));
	const storeResource = getStoreResource(userDB, get(initialProps, 'stores'));
	const storeDBResource = getStoreDBResource(userDB);

	const value = {
		userDB,
		userResource,
		siteResource,
		wpCredResource,
		storeResource,
		storeDBResource,
	};

	// @ts-ignore
	return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
};

export default AppStateProvider;
