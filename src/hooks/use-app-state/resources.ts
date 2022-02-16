import { ObservableResource } from 'observable-hooks';
import { from, of, combineLatest, shareReplay, withLatestFrom } from 'rxjs';
import { tap, switchMap, filter, map, catchError, debounceTime } from 'rxjs/operators';
import { isRxDocument } from 'rxdb/plugins/core';
import { userDBPromise } from '@wcpos/common/src/database/users-db';
import { storeDBPromise } from '@wcpos/common/src/database/stores-db';

type InitialProps = import('@wcpos/common/src//types').InitialProps;
type UserDocument = import('@wcpos/common/src/database').UserDocument;
type UserDatabase = import('@wcpos/common/src/database').UserDatabase;
type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;
type StoreDocument = import('@wcpos/common/src/database').StoreDocument;
type SiteDocument = import('@wcpos/common/src/database').SiteDocument;
type WPCredentialsDocument = import('@wcpos/common/src/database').WPCredentialsDocument;

const userDB$ = from(userDBPromise()).pipe(shareReplay(1));
export const userDBResource = new ObservableResource(userDB$, (value: any) => !!value);

/**
 * User
 */
const user$ = userDB$.pipe(
	switchMap((userDB) =>
		userDB.users.getLocal$('current').pipe(
			switchMap((current) => {
				return current && current?.get('id')
					? userDB.users.findOne(current.get('id')).exec()
					: of(null);
			}),
			tap(async (user) => {
				if (!user) {
					const defaultUser = await userDB.users.insert({
						first_name: 'Test',
						last_name: 'User',
					});
					await userDB.users.upsertLocal('current', { id: defaultUser.localID });
				}
			}),
			filter((user) => !!user)
		)
	)
) as unknown as UserDocument;

/**
 * Site
 */
const site$ = userDB$.pipe(
	switchMap((userDB) =>
		userDB.sites.getLocal$('current').pipe(
			switchMap((current) => {
				return current && current?.get('id')
					? userDB.sites.findOne(current.get('id')).exec()
					: of(null);
			})
		)
	)
);

/**
 * WP Credentials
 */
const wpCredentials$ = userDB$.pipe(
	switchMap((userDB) =>
		userDB.wp_credentials.getLocal$('current').pipe(
			switchMap((current) => {
				return current && current?.get('id')
					? userDB.wp_credentials.findOne(current.get('id')).exec()
					: of(null);
			})
		)
	)
);

/**
 * Store
 */
const store$ = userDB$.pipe(
	switchMap((userDB) =>
		userDB.stores.getLocal$('current').pipe(
			switchMap((current) => {
				return current && current?.get('id')
					? userDB.stores.findOne(current.get('id')).exec()
					: of(null);
			})
		)
	)
);

/**
 * Store DB
 */
const storeDB$ = combineLatest([user$, site$, wpCredentials$, store$]).pipe(
	switchMap(([user, site, wpCredentials, store]) => {
		if (!user || !site || !wpCredentials || !store) {
			return of(null);
		}

		return storeDBPromise(store?.localID);
	})
);

/**
 * App State Resource
 */
export const appStateResource = new ObservableResource(
	combineLatest([user$, site$, wpCredentials$, store$, storeDB$]).pipe(debounceTime(100))
);
