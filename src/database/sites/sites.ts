import schema from './schema.json';
import { ConnectionService } from './service';

export type SiteSchema = import('./interface').SiteSchema;
export type SiteDocument = import('rxdb').RxDocument<SiteSchema, SiteMethods>;
export type SiteCollection = import('rxdb').RxCollection<SiteDocument, SiteMethods, SiteStatics>;
type SiteStatics = Record<string, never>;

interface SiteMethods {
	connect: () => Promise<any>;
}

const methods: SiteMethods = {
	/**
	 *
	 */
	async connect(this: SiteDocument) {
		await this.connection.connect();
	},
};

export const sites = {
	schema,
	// pouchSettings: {},
	// statics: {},
	methods,
	// attachments: {},
	// options: {},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
