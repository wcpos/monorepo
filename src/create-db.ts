// import Platform from '@wcpos/core/src/lib/platform';
// import set from 'lodash/set';
import { createRxDatabase, removeRxDatabase } from 'rxdb';

import config from './adapter';
import './plugins';

/**
 * creates the generic database
 */
export function createDB<T>(name: string) {
	return createRxDatabase<T>({
		name,
		...config,
		password: 'posInstanceId',
		localDocuments: true,
	});

	// add to window for debugging
	// if (Platform.OS === 'web') {
	// 	if (!(window as any).dbs) {
	// 		set(window, 'dbs', {});
	// 	}
	// 	(window as any).dbs[name] = db;
	// }

	// return db;
}

/**
 * deletes the generic database
 */
export function removeDB(name: string) {
	return removeRxDatabase(name, config.storage);
}
