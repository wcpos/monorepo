import { ObservableResource } from 'observable-hooks';
import { isRxDocument } from 'rxdb';
import { from, forkJoin } from 'rxjs';
import { tap, switchMap, filter, map, catchError, debounceTime } from 'rxjs/operators';

import { userDBPromise } from '@wcpos/database/src/users-db';
import log from '@wcpos/utils/src/logger';

type UserDocument = import('@wcpos/database').UserDocument;
type UserDatabase = import('@wcpos/database').UserDatabase;
type StoreDatabase = import('@wcpos/database').StoreDatabase;
type StoreDocument = import('@wcpos/database').StoreDocument;
type SiteDocument = import('@wcpos/database').SiteDocument;
type WPCredentialsDocument = import('@wcpos/database').WPCredentialsDocument;

const userDB$ = from(userDBPromise());
// export const userDBResource = new ObservableResource(userDB$, (value: any) => !!value);

// /**
//  * User
//  */
// const user$ = userDB$.pipe(
// 	/**
// 	 *
// 	 */
// 	filter((userDB) => {
// 		log.silly('userDB', userDB);
// 		log.silly('userDB Collections', userDB.collections);
// 		return !!userDB;
// 	}),

// 	/**
// 	 *
// 	 */
// 	switchMap((userDB) =>
// 		userDB.getLocal$('current').pipe(
// 			/**
// 			 *
// 			 */
// 			filter((current) => {
// 				log.debug('current', current);
// 				const userID = current && current.get('userID');

// 				if (!userID) {
// 					/**
// 					 * @TODO - what if current userID but there is a User in the DB?
// 					 */
// 					userDB.users
// 						.insert({
// 							first_name: 'Global',
// 							last_name: 'User',
// 						})
// 						.then((defaultUser) => {
// 							return userDB.upsertLocal('current', { userID: defaultUser.uuid });
// 						})
// 						.catch((error) => {
// 							log.error(error);
// 						});
// 				}

// 				return !!userID;
// 			}),

// 			/**
// 			 *
// 			 */
// 			switchMap((current) => {
// 				const userID = current && current.get('userID');
// 				log.debug('userID', userID);

// 				// userDB.users.findOne({ selector: { localID: current.get('userID') } }).exec();
// 				/**
// 				 * @TODO - this will always return a user, I think it is a bug in rxdb
// 				 * but handy here because it will return the first UserDocument found if no userID is found
// 				 */
// 				return userDB.users.findOne(userID).exec();
// 			}),

// 			/**
// 			 *
// 			 */
// 			filter((user) => {
// 				log.silly('user', user);
// 				if (!user) {
// 					// @TODO - what if no user?
// 					// delete and start again?
// 					userDB.upsertLocal('current', null);
// 				}
// 				return !!user;
// 			})
// 		)
// 	)
// );
// export const userResource = new ObservableResource(user$, (value: any) => !!value);

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
				log.debug('selected', current);
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
				log.debug('selected result', result);
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
		log.debug(result);
	})
);
export const selectedResource = new ObservableResource(selected$, (value: any) => !!value);
