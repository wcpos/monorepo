import { userCollections } from './collections';
import { createDB, removeDB } from './create-db';

export type UserDatabaseCollections = {
	logs: import('./collections/logs').LogCollection;
	users: import('./collections/users').UserCollection;
	sites: import('./collections/sites').SiteCollection;
	wp_credentials: import('./collections/wp-credentials').WPCredentialsCollection;
	stores: import('./collections/sites').SiteCollection;
};
export type UserDatabase = import('rxdb').RxDatabase<UserDatabaseCollections>;

/**
 *
 */
let userDB: Promise<UserDatabase>;

/**
 * This could be called more than once, so we need to make sure we only create the DB once.
 */
export function userDBPromise() {
	if (userDB) {
		return userDB;
	}

	userDB = createDB<UserDatabaseCollections>('wcposusers')
		.then(async (db) => {
			await db.addCollections(userCollections);
			return db;
		})
		.catch((error) => {
			console.error(error);
			if (process.env.NODE_ENV === 'development') {
				return removeDB('wcposusers');
			}
		});

	return userDB;
}
