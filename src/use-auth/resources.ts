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
	filter((userDB) => {
		console.log('userDB', userDB);
		console.log('userDB Collections', userDB.collections);
		return !!userDB;
	}),
	/**
	 *
	 */
	switchMap((userDB) =>
		userDB.getLocal$('current').pipe(
			/**
			 *
			 */
			filter(async (current) => {
				console.log('current', current);
				const userID = current && current.get('userID');

				if (!userID) {
					/**
					 * @TODO - what if current userID bu there is a User in the DB?
					 */
					const defaultUser = await userDB.users
						.insert({
							first_name: 'Global',
							last_name: 'User',
						})
						.catch((error) => {
							console.error(error);
						});
					userDB.upsertLocal('current', { userID: defaultUser.localID }).catch((error) => {
						console.error(error);
					});
				}

				return !!userID;
			}),

			/**
			 *
			 */
			switchMap((current) => {
				const userID = current && current.get('userID');
				console.log('userID', userID);

				// userDB.users.findOne({ selector: { localID: current.get('userID') } }).exec();
				/**
				 * @TODO - this will always return a user, I think it is a bug in rxdb
				 * but handy here because it will return the first UserDocument found if no userID is found
				 */
				return userDB.users.findOne({ selector: { localID: userID } }).exec();
			}),

			/**
			 *
			 */
			filter((user) => {
				console.log('user', user);
				return !!user;
			}),
			/**
			 *
			 */
			tap((result) => {
				console.log('user result', result);
			})
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
			 * @TODO - findOne(undefined|null|'') will match the first record, I think it is a bug in rxdb
			 * I use '_' here which should not match a record, empty string will match the first record
			 */
			switchMap((current) => {
				console.log('selected', current);
				return forkJoin([
					userDB.sites.findOne(current.get('siteID') || '_').exec(),
					userDB.wp_credentials.findOne(current.get('wpCredentialsID') || '_').exec(),
					userDB.stores.findOne(current.get('storeID') || '_').exec(),
				]);
			}),

			/**
			 *
			 */
			tap((result) => {
				console.log('selected result', result);
			})
		);
	}),

	/**
	 * @TODO - do sanity check: store should be in wpCredentials, creds in site, site in user
	 */
	map(([site, wpCredentials, store]) => {
		if (!site || !wpCredentials || !store) {
			return {
				site: null,
				wpCredentials: null,
				store: null,
			};
		}

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
