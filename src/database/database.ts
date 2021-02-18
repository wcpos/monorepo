import createDatabase from './adapter';
import createCollectionMap from './users';

type UserDatabase = import('./types').UserDatabase;

const databasePromise = createDatabase('wcpos_users').then((db) =>
	Promise.all(
		createCollectionMap.map((createCollection) => {
			// @ts-ignore
			return createCollection(db);
		})
	).then((values) => {
		console.log(values);
		console.log(db);
		return db;
	})
);

export default databasePromise;
