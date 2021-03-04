import schema from './schema.json';

export type WPCredentialsSchema = import('./interface').WPCredentialsSchema;
export type WPCredentialsDocument = import('rxdb').RxDocument<
	WPCredentialsSchema,
	WPCredentialsMethods
>;
export type WPCredentialsCollection = import('rxdb').RxCollection<
	WPCredentialsDocument,
	WPCredentialsMethods,
	WPCredentialsStatics
>;
type WPCredentialsMethods = Record<string, never>;
type WPCredentialsStatics = Record<string, never>;

export const wpCredentials = {
	schema,
	// pouchSettings: {},
	// statics: {},
	// methods: {},
	// attachments: {},
	// options: {},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
