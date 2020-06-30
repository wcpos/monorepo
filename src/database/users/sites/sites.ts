import schema from './schema.json';

const createSitesCollection = async (db) => {
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
