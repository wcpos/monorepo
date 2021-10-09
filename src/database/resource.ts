import { createRxDatabase } from 'rxdb/plugins/core';
import { getRxStoragePouch } from 'rxdb/plugins/pouchdb';
import Platform from '@wcpos/common/src/lib/platform';
import set from 'lodash/set';
import { from } from 'rxjs';
// import { tap } from 'rxjs/operators';
import { userCollections, storeCollections } from './collections';
import './plugins';

/**
 * creates the generic database
 */
async function createDB<T>(name: string) {
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

/**
 * UserDB
 */
export type UserDatabaseCollections = {
	logs: import('./collections/logs').LogCollection;
	users: import('./collections/users').UserCollection;
	sites: import('./collections/sites').SiteCollection;
	wp_credentials: import('./collections/wp-credentials').WPCredentialsCollection;
	stores: import('./collections/sites').SiteCollection;
};
export type UserDatabase = import('rxdb').RxDatabase<UserDatabaseCollections>;

export const userDB$ = from(
	createDB<UserDatabaseCollections>('wcposusers').then((db) => {
		// @ts-ignore
		await db.addCollections(userCollections);
		return db;
	})
);

/**
 * StoresDB
 */
