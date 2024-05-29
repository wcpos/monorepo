import { createRxDatabase, removeRxDatabase } from 'rxdb';
import { disableVersionCheck } from 'rxdb-premium/plugins/shared';

import log from '@wcpos/utils/src/logger';

import config from './adapter';

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
			password: 'posInstanceId',
			ignoreDuplicate: true, // I think Expo enables HMR, so we need to ignore duplicate
			// multiInstance: false,
		});

		return db;
	} catch (error) {
		log.error(error);
	}
}

// /**
//  * deletes the generic database
//  */
// export function removeDB(name: string) {
// 	return removeRxDatabase(name, config.storage);
// }
