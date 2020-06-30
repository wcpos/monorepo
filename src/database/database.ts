import createDatabase from './adapter';
import createCollectionMap from './users';

const databasePromise = createDatabase('wcpos_users').then((db) => {
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
