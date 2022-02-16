// import { from } from 'rxjs';
// import { shareReplay } from 'rxjs/operators';
import { userCollections } from './collections';
import { createDB } from './create-db';

export type UserDatabaseCollections = {
	logs: import('./collections/logs').LogCollection;
	users: import('./collections/users').UserCollection;
	sites: import('./collections/sites').SiteCollection;
	wp_credentials: import('./collections/wp-credentials').WPCredentialsCollection;
	stores: import('./collections/sites').SiteCollection;
};
export type UserDatabase = import('rxdb').RxDatabase<UserDatabaseCollections>;

/**
 *
 */
export async function userDBPromise() {
	const db = await createDB<UserDatabaseCollections>('wcposusers');
	// @ts-ignore
	const collections = await db.addCollections(userCollections);

	return db;
}

/**
 *
 */
// export const userDB$ = from(userDBPromise()).pipe(shareReplay(1));
