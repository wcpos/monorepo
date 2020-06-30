import schema from './schema.json';

type SiteSchema = import('./interface').WordPressSitesSchema;
export type SiteModel = import('rxdb').RxDocument<SiteSchema, unknown>;
export type SitesCollection = import('rxdb').RxCollection<SiteModel, unknown, unknown>;
type Database = import('../../database').Database;

const createSitesCollection = async (db: Database): Promise<SitesCollection> => {
	const sitesCollection = await db.collection({
		name: 'sites',
		schema,
		methods: {
			connect() {
				logger.info(`Connecting to ${this.urlForceHttps}`);
			},
		},
	});

	sitesCollection.postCreate((raw, model) => {
		Object.defineProperties(model, {
			/**
			 *
			 */
			nameOrUrl: {
				get: () => {
					return model.name || model.url;
				},
			},

			/**
			 *
			 */
			urlWithoutPrefix: {
				get: () => {
					return model.url.replace(/^.*:\/{2,}|\s|\/+$/g, '');
				},
			},

			/**
			 *
			 */
			urlForceHttps: {
				get: () => {
					return `https://${model.urlWithoutPrefix}`;
				},
			},
		});
	});

	return sitesCollection;
};

export default createSitesCollection;
