import log from '@wcpos/utils/src/logger';

import { storeCollections, StoreCollections } from './collections';
import { createDB, removeDB } from './create-db';

import type { RxDatabase } from 'rxdb';

export type StoreDatabase = RxDatabase<StoreCollections>;

/**
 * Database name needs to start with a letter, id is a short uuid
 */
function sanitizeStoreName(id: string) {
	return `store_${id}`;
}

/**
 *
 */
// const registry = new Map<string, Promise<StoreDatabase | undefined>>();

/**
 * creates the Store database
 */
export async function createStoreDB(id: string) {
	const name = sanitizeStoreName(id);
	try {
		const db = await createDB(name);
		const collections = await db?.addCollections(storeCollections);
		return db;
	} catch (error) {
		log.error(error);
		removeDB(name + '_v150');
	}
	// if (!registry.has(id)) {
	// 	const name = sanitizeStoreName(id);
	// 	try {
	// 		const db = await createDB<StoreDatabaseCollections>(name);
	// 		if (db) {
	// 			const collections = await db?.addCollections(storeCollections);
	// 			registry.set(id, Promise.resolve(db));
	// 		}
	// 	} catch (error) {
	// 		log.error(error);
	// 		removeDB(name);
	// 	}
	// }

	// return registry.get(id);
}

/**
 * removes the Store database by name
 */
export async function removeStoreDB(id: string) {
	const name = sanitizeStoreName(id);
	return removeDB(name + '_v150');
}
