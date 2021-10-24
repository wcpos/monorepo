import { ObservableResource } from 'observable-hooks';
import { from, of, combineLatest, shareReplay, withLatestFrom } from 'rxjs';
import { tap, switchMap, filter, map, catchError, delay } from 'rxjs/operators';
import { isRxDocument } from 'rxdb/plugins/core';
import { userDB$ } from '@wcpos/common/src/database/users-db';
import { getStoreDB$ } from '@wcpos/common/src/database/stores-db';

type InitialProps = import('@wcpos/common/src//types').InitialProps;
type UserDocument = import('@wcpos/common/src/database').UserDocument;
type UserDatabase = import('@wcpos/common/src/database').UserDatabase;
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
type StoreDocument = import('@wcpos/common/src/database').StoreDocument;
type SiteDocument = import('@wcpos/common/src/database').SiteDocument;
type WPCredentialsDocument = import('@wcpos/common/src/database').WPCredentialsDocument;

/**
 * hydrateResources
 */
export const getResource = (userDB: UserDatabase, initialProps: any) => {
	const user$ = userDB.users.getLocal$('current').pipe(
		tap(async (current) => {
			// no current object, eg: first load
			if (!current) {
				// @ts-ignore
				const defaultUser = await userDB.users.insert({ firstName: 'Test', lastName: 'User' });
				const localDoc = await userDB.users.upsertLocal('current', { id: defaultUser.localID });
			}
		}),
		// filter((current) => !!current && current.get('id')),
		switchMap(async (current: any) => {
			if (current && current.get('id')) {
				return userDB.users.findOne(current.get('id')).exec();
			}
			return of(null);
		}),
		filter((user) => !!user && isRxDocument(user)),
		shareReplay(1)
	);

	const currentSite$ = userDB.sites.getLocal$('current').pipe(
		switchMap((current) => {
			if (current && current.get('id')) {
				return userDB.sites.findOne(current.get('id')).exec();
			}
			return of(null);
		}),
		shareReplay(1)
	);

	// combine currentSite and user
	const site$ = combineLatest([user$, currentSite$]).pipe(
		switchMap(async ([user, currentSite]) => {
			// @ts-ignore
			const sites = await user?.populate('sites');
			const siteExists = Array.isArray(sites) && currentSite && sites.includes(currentSite);

			if (initialProps.site) {
				if (siteExists) {
					// should I update the data just in case?
					return currentSite;
				}
				// @ts-ignore
				await user?.addSite(initialProps.site).then((s) => {
					return userDB.sites.upsertLocal('current', { id: s.localID });
				});
			} else {
				return currentSite;
			}
			return null;
		}),
		shareReplay(1)
	);

	const currentWpCredentials$ = userDB.wp_credentials.getLocal$('current').pipe(
		switchMap((current: any) => {
			if (current && current.get('id')) {
				return userDB.wp_credentials.findOne(current.get('id')).exec();
			}
			return of(null);
		}),
		shareReplay(1)
	);

	const wpCredentials$ = combineLatest([site$, currentWpCredentials$]).pipe(
		switchMap(async ([site, currentWpCreds]) => {
			const creds = await site?.populate('wpCredentials');
			const exists = Array.isArray(creds) && currentWpCreds && creds.includes(currentWpCreds);

			if (initialProps.wpCredentials) {
				if (exists) {
					// should I update the data just in case?
					return currentWpCreds;
				}
				await site?.addWpCredentials(initialProps.wpCredentials).then((doc) => {
					return userDB.wp_credentials.upsertLocal('current', { id: doc.localID });
				});
			} else {
				return currentWpCreds;
			}
			return null;
		}),
		shareReplay(1)
	);

	const currentStore$ = userDB.stores.getLocal$('current').pipe(
		switchMap((current: any) => {
			if (current && current.get('id')) {
				return userDB.stores.findOne(current.get('id')).exec();
			}
			return of(null);
		}),
		shareReplay(1)
	);

	const store$ = combineLatest([wpCredentials$, currentStore$]).pipe(
		switchMap(async ([wpCredentials, currentStore]) => {
			const stores = await wpCredentials?.populate('stores');
			const exists = Array.isArray(stores) && currentStore && stores.includes(currentStore);

			if (initialProps.store) {
				if (exists) {
					// should I update the data just in case?
					return currentStore;
				}
				await wpCredentials?.addStore(initialProps.store).then((doc) => {
					return userDB.stores.upsertLocal('current', { id: doc.localID });
				});
			} else {
				return currentStore;
			}
			return null;
		}),
		shareReplay(1)
	);

	const storeDB$ = store$.pipe(
		switchMap((store: any) => {
			if (store) {
				return getStoreDB$(store.localID);
			}
			return of(null);
		}),
		shareReplay(1)
	);

	const resource$ = combineLatest([
		user$,
		site$,
		wpCredentials$,
		store$,
		storeDB$,
		// of(null).pipe(delay(5000)),
	]).pipe(
		// convert array into object
		map(([user, site, wpCredentials, store, storeDB]) => ({
			user,
			site,
			wpCredentials,
			store,
			storeDB,
		})),
		tap((res) => {
			console.log(res);
		})
	);

	return new ObservableResource(resource$, (value: any) => !!value);
};
