import schema from './schema.json';

type RxCollection = import('rxdb').RxCollection;
type RxDatabase = import('rxdb').RxDatabase;

export const users = {
	schema,
	// pouchSettings: {},
	statics: {
		preInsertSites(plainData: Record<string, unknown>, collection: RxCollection, db: RxDatabase) {
			debugger;
		},
	},
	methods: {},
	// attachments: {},
	// options: {},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
