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
			filter(async (current) => {
				const userID = current && current.get('userID');

				if (!userID) {
					/**
					 * @TODO - what if current userID bu there is a User in the DB?
					 */
					const defaultUser = await userDB.users.insert({
						first_name: 'Global',
						last_name: 'User',
					});
					userDB.upsertLocal('current', { userID: defaultUser.localID });
				}

				return !!userID;
			}),
			/**
			 *
			 */
			switchMap((current) => {
				const userID = current && current.get('userID');
				// userDB.users.findOne({ selector: { localID: current.get('userID') } }).exec();
				/**
				 * @TODO - this will always return a user, I think it is a bug in rxdb
				 * but handy here because it will return the first UserDocument found if no userID is found
				 */
				return userDB.users.findOne(userID).exec();
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
