import { ObservableResource } from 'observable-hooks';
import { from, forkJoin } from 'rxjs';
import { tap, switchMap, filter, map, catchError, debounceTime } from 'rxjs/operators';
import { isRxDocument } from 'rxdb';
import { userDBPromise } from '@wcpos/database/src/users-db';

// type InitialProps = import('@wcpos/core/src//types').InitialProps;
type UserDocument = import('@wcpos/database').UserDocument;
type UserDatabase = import('@wcpos/database').UserDatabase;
type StoreDatabase = import('@wcpos/database').StoreDatabase;
type StoreDocument = import('@wcpos/database').StoreDocument;
type SiteDocument = import('@wcpos/database').SiteDocument;
type WPCredentialsDocument = import('@wcpos/database').WPCredentialsDocument;

const userDB$ = from(userDBPromise());
export const userDBResource = new ObservableResource(userDB$, (value: any) => !!value);

/**
 * User
 */
const user$ = userDB$.pipe(
	/**
	 *
	 */
	filter((userDB) => !!userDB),
	/**
	 *
	 */
	switchMap((userDB) =>
		userDB.getLocal$('current').pipe(
			/**
			 *
			 */
			switchMap((current) => {
				return userDB.users.findOne({ selector: { localID: current.get('userID') } }).exec();
			}),
			/**
			 *
			 */
			tap(async (user) => {
				if (!user) {
					const defaultUser = await userDB.users.insert({
						first_name: 'Test',
						last_name: 'User',
					});
					await userDB.upsertLocal('current', { userID: defaultUser.localID });
				}
			}),
			/**
			 *
			 */
			filter((user) => !!user)
		)
	)
);
export const userResource = new ObservableResource(user$, (value: any) => !!value);

/**
 * Selected Store
 */
const selected$ = userDB$.pipe(
	/**
	 *
	 */
	switchMap((userDB) => {
		return userDB.getLocal$('current').pipe(
			/**
			 *
			 */
			filter((current) => !!current),

			/**
			 *
			 */
			switchMap((current) => {
				return forkJoin([
					userDB.sites.findOne({ selector: { localID: current.get('siteID') } }).exec(),
					userDB.wp_credentials
						.findOne({ selector: { localID: current.get('wpCredentialsID') } })
						.exec(),
					userDB.stores.findOne({ selector: { localID: current.get('storeID') } }).exec(),
				]);
			})
		);
	}),

	/**
	 *
	 */
	map(([site, wpCredentials, store]) => {
		return {
			site,
			wpCredentials,
			store,
		};
	}),

	/**
	 *
	 */
	tap((result) => {
		console.log(result);
	})
);
export const selectedResource = new ObservableResource(selected$, (value: any) => !!value);
