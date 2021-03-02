import schema from './schema.json';

type Database = import('../../types').UserDatabase;
type LogCollection = import('../../types').LogCollection;

const createLogsCollection = async (db: Database): Promise<LogCollection> => {
	const collections = await db.addCollections({
		logs: {
			schema,
			// pouchSettings: {},
			// statics: {},
			// methods: {},
			// attachments: {},
			// options: {},
			// migrationStrategies: {},
			// autoMigrate: true,
			// cacheReplacementPolicy() {},
		},
	});

	return collections.logs;
};

export default createLogsCollection;
