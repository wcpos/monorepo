import { switchMap } from 'rxjs/operators';
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

		const parsedData = {
			id: data.userlocalID,
			username: data.username,
			displayName: data.display_name,
			email: data.email,
			firstName: data.firstname,
			lastName: data.lastname,
			jwt: data.jwt,
			niceName: data.nicename,
		};

		try {
			const wpUser = await wpCredentialsCollection
				.findOne({
					selector: { id: data.userlocalID },
				})
				.exec();

			if (wpUser) {
				// @ts-ignore
				return wpUser.atomicPatch(parsedData);
			}
			// @ts-ignore
			const newWpUser = await wpCredentialsCollection.insert(parsedData);
			await this.atomicUpdate((oldData) => {
				oldData.wpCredentials = oldData.wpCredentials || [];
				// @ts-ignore
				oldData.wpCredentials.push(newWpUser.localID);
				return oldData;
			});

			return newWpUser;
		} catch (error) {
			throw Error(String(error));
		}
	},

	async addWpCredentials(this: SiteDocument, data) {
		const wpCredentials = await this.collections().wp_credentials.insert(data);
		await this.update({ $push: { wpCredentials: wpCredentials.localID } }).catch((err) => {
			console.log(err);
			return err;
		});

		return wpCredentials;
	},

	/**
	 *
	 */
	getWcApiUrl(this: SiteDocument) {
		return `${this.wpApiUrl}wc/v3`;
	},

	/**
	 *
	 */
	getWcposApiUrl(this: SiteDocument) {
		return `${this.wpApiUrl}wcpos/v1`;
	},

	/**
	 *
	 */
	getWpCredentials$(this: SiteDocument) {
		return this.wpCredentials$.pipe(
			switchMap(async () => {
				const wpCredentials = await this.populate('wpCredentials');
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
	// pouchSettings: {},
	// statics: {},
	methods,
	// attachments: {},
	options: {
		middlewares: {
			// postCreate: {
			// 	handle: postCreate,
			// 	parallel: false,
			// },
		},
	},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
