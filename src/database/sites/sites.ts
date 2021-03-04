import schema from './schema.json';

export type SiteSchema = import('./interface').SiteSchema;
export type SiteDocument = import('rxdb').RxDocument<SiteSchema, SiteMethods>;
export type SiteCollection = import('rxdb').RxCollection<SiteDocument, SiteMethods, SiteStatics>;
type SiteMethods = Record<string, never>;
type SiteStatics = Record<string, never>;

export const sites = {
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
