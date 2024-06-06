import log from '@wcpos/utils/src/logger';

import { syncCollections, SyncCollections } from './collections';
import { createMemorySyncedDB } from './create-db';

import type { RxDatabase } from 'rxdb';

export type FastStoreDatabase = RxDatabase<SyncCollections>;

/**
 * Database name needs to start with a letter, id is a short uuid
 */
function sanitizeStoreName(id: string) {
	return `fast_store_v2_${id}`;
}

/**
 *
 */
// const registry = new Map<string, Promise<StoreDatabase | undefined>>();

/**
 * creates the Store database
 */
export async function createFastStoreDB(id: string) {
	const name = sanitizeStoreName(id);
	try {
		const db = await createMemorySyncedDB(name);
		const collections = await db?.addCollections(syncCollections);
		return db;
	} catch (error) {
		log.error(error);
	}
}
