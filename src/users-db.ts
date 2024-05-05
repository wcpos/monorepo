import log from '@wcpos/utils/src/logger';

import { userCollections, UserCollections } from './collections';
import { createDB, removeDB } from './create-db';

import type { RxDatabase } from 'rxdb';

export type UserDatabase = RxDatabase<UserCollections>;

const dbName = 'wcposusers_v2';

/**
 *
 */
export const removeUserDB = async () => {
	return removeDB(dbName);
};

/**
 *
 */
export const createUserDB = async () => {
	try {
		const db = await createDB<UserCollections>(dbName);
		const collections = await db?.addCollections(userCollections);
		return db;
	} catch (error) {
		log.error(error);
		// removeDB('wcposusers_v150');
	}
};
