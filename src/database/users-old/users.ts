import schema from './schema.json';
import methods from './methods';
import statics from './statics';

type Database = import('../types').UserDatabase;

const createUsersCollection = async (db: Database) => {
	const collections = await db.addCollections({
		users: {
			schema,
			// pouchSettings: {},
			statics,
			methods,
			// attachments: {},
			// options: {},
			// migrationStrategies: {},
			// autoMigrate: true,
			// cacheReplacementPolicy() {},
		},
	});

	return collections.users;
};

export default createUsersCollection;
