import { createRxDatabase } from 'rxdb/plugins/core';
import { getRxStoragePouch } from 'rxdb/plugins/pouchdb';
import Platform from '@wcpos/common/src/lib/platform';
import set from 'lodash/set';
import './plugins';

/**
 * creates the generic database
 */
export async function createDB<T>(name: string) {
	const db = await createRxDatabase<T>({
		name,
		ignoreDuplicate: process.env.NODE_ENV === 'development',
		// ...config,
		// pouchSettings: { revs_limit: 1, auto_compaction: true },
		storage: getRxStoragePouch('idb', { revs_limit: 1, auto_compaction: true }),
	});

	// add to window for debugging
	if (Platform.OS === 'web') {
		if (!(window as any).dbs) {
			set(window, 'dbs', {});
		}
		(window as any).dbs[name] = db;
	}

	return db;
}
