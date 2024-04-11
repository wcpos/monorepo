import log from '@wcpos/utils/src/logger';

import { userCollections, UserCollections } from './collections';
import { createDB, removeDB } from './create-db';

import type { RxDatabase } from 'rxdb';

export type UserDatabase = RxDatabase<UserCollections>;

/**
 *
 */
let userDB: Promise<UserDatabase>;

/**
 * This could be called more than once, so we need to make sure we only create the DB once.
 */
export async function createUserDB() {
	if (!userDB) {
		try {
			const db = await createDB('wcposusers');
			const collections = await db?.addCollections(userCollections);
			userDB = Promise.resolve(db);
		} catch (error) {
			log.error(error);
			removeDB('wcposusers_v150');
		}
	}

	return userDB;
}

/**
 *
 */
export async function removeUserDB() {
	return removeDB('wcposusers_v150');
}
