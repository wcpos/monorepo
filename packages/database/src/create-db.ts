import { createRxDatabase, removeRxDatabase } from 'rxdb';
import { disableVersionCheck } from 'rxdb-premium/plugins/shared';

import log from '@wcpos/utils/logger';

import config from './adapter';
import { fastConfig } from './fast-adapter';

import './plugins';
disableVersionCheck();

/**
 * creates the generic database
 */
export async function createDB<DBCollections>(name: string) {
	try {
		const db = await createRxDatabase<DBCollections>({
			name: `${name}`,
			...config,
			allowSlowCount: true,
			// password: 'posInstanceId',
			multiInstance: false,
		});

		return db;
	} catch (error) {
		log.error(error);
	}
}

/**
 * creates the memory synced database
 * NOTE: it's not actually memory synced anymore, it uses IndexedDB worker like the main database
 * Memory Mapped Storage is probably quicker for small stores, but it is worse for large stores
 */
export async function createMemorySyncedDB<DBCollections>(name: string) {
	try {
		const db = await createRxDatabase<DBCollections>({
			name: `${name}`,
			...fastConfig,
			allowSlowCount: true,
			// password: 'posInstanceId',
			multiInstance: false,
		});

		return db;
	} catch (error) {
		log.error(error);
	}
}
