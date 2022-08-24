import { switchMap } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import get from 'lodash/get';
import schema from './schema.json';

export type SiteSchema = import('./interface').SiteSchema;
export type SiteDocument = import('rxdb').RxDocument<SiteSchema, SiteMethods>;
export type SiteCollection = import('rxdb').RxCollection<SiteDocument, SiteMethods, SiteStatics>;
type SiteStatics = Record<string, unknown>;
type WPCredentialsCollection = import('../wp-credentials').WPCredentialsCollection;
type WPCredentialsDocument = import('../wp-credentials').WPCredentialsDocument;
type WPCredentialsDocumentsObservable = import('rxjs').Observable<WPCredentialsDocument[]>;

interface SiteMethods {
	getUrlWithoutProtocol: () => string;
	connect: () => Promise<any>;
	addOrUpdateWpCredentials: (data: Record<string, unknown>) => Promise<WPCredentialsDocument>;
	addWpCredentials: (data: Record<string, unknown>) => Promise<WPCredentialsDocument>;
	getWcApiUrl: () => string;
	getWcposApiUrl: () => string;
	getWpCredentials$: () => WPCredentialsDocumentsObservable;
}

const methods: SiteMethods = {
	/**
	 *
	 */
	getUrlWithoutProtocol(this: SiteDocument) {
		return this?.url?.replace(/^.*:\/{2,}|\s|\/+$/g, '') || '';
	},

	/**
	 *
	 */
	async connect(this: SiteDocument) {
		await this.connection.connect();
	},

	/**
	 *
	 */
	async addOrUpdateWpCredentials(this: SiteDocument, data) {
		const wpCredentialsCollection: WPCredentialsCollection = get(
			this,
			'collection.database.collections.wp_credentials'
		);

		try {
			const wpCredentials = (await this.populate('wp_credentials')) || [];
			const wpCredentialsDoc = wpCredentials.find((d) => d.id === data.id);

			if (wpCredentialsDoc) {
				return wpCredentialsDoc.atomicPatch(data);
			}

			const newWpUser = await wpCredentialsCollection.insert(data);
			await this.atomicUpdate((oldData) => {
				oldData.wp_credentials = oldData.wpCredentials || [];
				oldData.wp_credentials.push(newWpUser.localID);
				return oldData;
			});

			return newWpUser;
		} catch (error) {
			throw Error(String(error));
		}
	},

	async addWpCredentials(this: SiteDocument, data) {
		const wpCredentials = await this.collection.database.collections.wp_credentials.insert(data);
		await this.update({ $push: { wp_credentials: wpCredentials.localID } }).catch((err) => {
			console.log(err);
			return err;
		});

		return wpCredentials;
	},

	/**
	 *
	 */
	getWcApiUrl(this: SiteDocument) {
		return `${this.wp_api_url}wc/v3`;
	},

	/**
	 *
	 */
	getWcposApiUrl(this: SiteDocument) {
		return `${this.wp_api_url}wcpos/v1`;
	},

	/**
	 *
	 */
	getWpCredentials$(this: SiteDocument) {
		return this.wp_credentials$.pipe(
			switchMap(async () => {
				const wpCredentials = await this.populate('wp_credentials');
				return wpCredentials || [];
			})
		);
	},
};

/**
 *
 */
// function postCreate(this: SiteCollection, plainData: any, rxDocument: SiteDocument) {
// 	const connectionServiceInstance = new ConnectionService(rxDocument);
// 	Object.defineProperty(rxDocument, 'connection', {
// 		get: () => connectionServiceInstance,
// 	});
// }

export const sites = {
	schema,
	// statics: {},
	methods,
	// attachments: {},
	options: {
		middlewares: {
			postCreate: {
				handle: (data, site) => {
					const populatedWpCredentials$ = site.wp_credentials$.pipe(
						switchMap(async (args: any) => {
							const wpCredentials = await site.populate('wp_credentials');
							return wpCredentials || [];
						})
					);
					Object.assign(site, {
						populatedWpCredentials$,
						wpCredentialsResource: new ObservableResource(populatedWpCredentials$),
					});
				},
				parallel: false,
			},
		},
	},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
	// localDocuments: true,
};
