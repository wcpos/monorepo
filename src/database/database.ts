import createDatabase from './adapter';
import createCollectionMap from './users';

type Collections = {
	logs: import('./users/logs/logs').LogsCollection;
	// eslint-disable-next-line camelcase
	app_users: import('./users/app-users/app-users').AppUsersCollection;
	sites: import('./users/sites/sites').SitesCollection;
};
export type Database = import('rxdb').RxDatabase<Collections>;

const databasePromise: Promise<Database> = createDatabase('wcpos_users').then((db) => {
	return Promise.all(
		createCollectionMap.map((createCollection) => {
			return createCollection(db);
		})
	).then((values) => {
		console.log(values);
		console.log(db);
		return db;
	});
});

export default databasePromise;
