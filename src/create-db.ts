import { createRxDatabase, removeRxDatabase } from 'rxdb';

import log from '@wcpos/utils/src/logger';

import config from './adapter';
import { disableVersionCheck } from 'rxdb-premium/dist/es/shared/version-check.js';

import './plugins';
disableVersionCheck();

/**
 * creates the generic database
 */
export async function createDB<T>(name: string) {
	try {
		return createRxDatabase<T>({
			name,
			...config,
			password: 'posInstanceId',
			localDocuments: true,
		});
	} catch (error) {
		log.error(error);
	}
}

/**
 * deletes the generic database
 */
export function removeDB(name: string) {
	return removeRxDatabase(name, config.storage);
}
