import log from '@wcpos/utils/src/logger';

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
let userDB: Promise<UserDatabase | undefined>;

/**
 * This could be called more than once, so we need to make sure we only create the DB once.
 */
export async function createUserDB() {
	if (!userDB) {
		try {
			const db = await createDB<UserDatabaseCollections>('wcposusers');
			const collections = await db?.addCollections(userCollections);
			userDB = Promise.resolve(db);
		} catch (error) {
			log.error(error);
			removeDB('wcposusers');
		}
	}

	return userDB;
}

/**
 * Helper function to add the collectioms individually, ie: after collection.remove()
 */
export async function addUserDBCollection(key: keyof UserDatabaseCollections) {
	try {
		const db = await createUserDB();
		const collection = await db.addCollections({
			[key]: userCollections[key],
		});
		return collection;
	} catch (error) {
		log.error(error);
	}
}

/**
 *
 */
export async function removeUserDB() {
	return removeDB('wcposusers');
}
