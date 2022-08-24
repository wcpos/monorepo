import schema from './schema.json';

export type LogSchema = import('./interface').LogSchema;
export type LogDocument = import('rxdb').RxDocument<LogSchema, LogMethods>;
export type LogCollection = import('rxdb').RxCollection<LogDocument, LogMethods, LogStatics>;
type LogMethods = Record<string, never>;
type LogStatics = Record<string, never>;

export const logs = {
	schema,
	// statics: {},
	// methods: {},
	// attachments: {},
	// options: {},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
