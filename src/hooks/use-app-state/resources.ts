import { ObservableResource } from 'observable-hooks';
import { from, of } from 'rxjs';
import { tap, switchMap, filter } from 'rxjs/operators';
import { getStoreDB$ } from '@wcpos/common/src/database/stores-db';

type InitialProps = import('@wcpos/common/src//types').InitialProps;
type UserDocument = import('@wcpos/common/src/database').UserDocument;
type UserDatabase = import('@wcpos/common/src/database').UserDatabase;
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
type SiteDocument = import('@wcpos/common/src/database').SiteDocument;
type WPCredentialsDocument = import('@wcpos/common/src/database').WPCredentialsDocument;

/**
 * User Resource
 */
export const getUserResource = (userDB: UserDatabase) => {
	const user$ = userDB.getLocal$('currentUser').pipe(
		tap(async (lastUser) => {
			if (!lastUser) {
				// @ts-ignore
				const defaultUser = await userDB.users.insert({ firstName: 'Test', lastName: 'User' });
				const localDoc = await userDB.upsertLocal('currentUser', { userID: defaultUser.localId });
			}
		}),
		filter((lastUser) => !!lastUser),
		switchMap((lastUser: any) => {
			const localId = lastUser.get('userID');
			const query = userDB.users.findOne(localId);
			return query.$;
		})
	);

	return new ObservableResource(user$, (value: any) => !!value);
};

/**
 * Site Resource
 */
export const getSiteResource = (userDB: UserDatabase, site: InitialProps['site']) => {
	let site$;

	if (site) {
		// find existing record by url
		const query = userDB.sites.findOne({ selector: { url: site.url } });
		site$ = query.$.pipe(
			// @ts-ignore
			tap((result) => {
				if (!result) {
					// @ts-ignore
					from(userDB.sites.insert(initSite));
					// } else {
					// 	result.atomicPatch(initSite);
				}
			})
		);
	} else {
		site$ = userDB.getLocal$('currentUser').pipe(
			switchMap((lastSite) => {
				const localId = lastSite?.get('siteID');
				const query = userDB.sites.findOne(localId);
				return query.$;
			})
		);
	}

	return new ObservableResource(site$);
};

/**
 * WP Credentials Resource
 */
export const getWpCredResource = (
	userDB: UserDatabase,
	wpCredentials: InitialProps['wpCredentials']
) => {
	let wpCredentials$;

	if (wpCredentials) {
		// find existing record by id
		// note: this needs to be improved, could be many records with same id
		const query = userDB.wp_credentials.findOne({ selector: { id: wpCredentials.id } });
		wpCredentials$ = query.$.pipe(
			// @ts-ignore
			tap((result) => {
				if (!result) {
					// @ts-ignore
					userDB.wp_credentials.insert(initWpCredentials);
					// } else {
					// 	result.atomicPatch(initWpCredentials);
				}
			})
		);
	} else {
		wpCredentials$ = userDB.getLocal$('currentUser').pipe(
			switchMap((current) => {
				const localId = current?.get('wpCredentialsID');
				const query = userDB.wp_credentials.findOne(localId);
				return query.$;
			})
		);
	}

	return new ObservableResource(wpCredentials$);
};

/**
 * Store Resource
 */
export const getStoreResource = (userDB: UserDatabase, stores: InitialProps['stores']) => {
	let store$;

	if (stores) {
		// find existing record by id
		// note: this needs to be improved, could be many records with same id
		const query = userDB.stores.findOne({ selector: { id: stores.id } });
		store$ = query.$.pipe(
			// @ts-ignore
			tap((result) => {
				if (!result) {
					// @ts-ignore
					userDB.stores.insert(initStores);
					// } else {
					// 	result.atomicPatch(initWpCredentials);
				}
			})
		);
	} else {
		store$ = userDB.stores.getLocal$('currentUser').pipe(
			switchMap((current) => {
				const localId = current?.get('storeID');
				const query = userDB.stores.findOne(localId);
				return query.$;
			})
		);
	}

	return new ObservableResource(store$);
};

/**
 * StoreDB Resource
 */
export const getStoreDBResource = (userDB: UserDatabase) => {
	const storeDB$ = userDB.stores.getLocal$('currentUser').pipe(
		switchMap((current) => {
			const id = current?.get('storeID');
			return id ? getStoreDB$(id) : of(null);
		})
	);

	return new ObservableResource(storeDB$);
};
