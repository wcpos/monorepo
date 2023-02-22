import schema from './schema.json';

export type SiteSchema = import('./interface').SiteSchema;
export type SiteDocument = import('rxdb').RxDocument<SiteSchema, SiteMethods>;
export type SiteCollection = import('rxdb').RxCollection<SiteDocument, SiteMethods, SiteStatics>;

type SiteMethods = Record<string, unknown>;
type SiteStatics = Record<string, unknown>;

export const sites = {
	schema,
};
