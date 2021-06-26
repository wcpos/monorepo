import { switchMap } from 'rxjs/operators';
import get from 'lodash/get';
import schema from './schema.json';

export type SiteSchema = import('./interface').SiteSchema;
export type SiteDocument = import('rxdb').RxDocument<SiteSchema, SiteMethods>;
export type SiteCollection = import('rxdb').RxCollection<SiteDocument, SiteMethods, SiteStatics>;
type SiteStatics = Record<string, never>;
type WPCredentialsCollection = import('../wp-credentials').WPCredentialsCollection;
type WPCredentialsDocument = import('../wp-credentials').WPCredentialsDocument;
type WPCredentialsDocumentsObservable = import('rxjs').Observable<WPCredentialsDocument[]>;

interface SiteMethods {
	getUrlWithoutProtocol: () => string;
	connect: () => Promise<any>;
	addOrUpdateWpCredentials: (data: Record<string, unknown>) => Promise<WPCredentialsDocument>;
	getWcApiUrl: () => string;
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
			id: data.id,
			username: data.username,
			displayName: data.display_name,
			email: data.email,
			firstName: data.firstname,
			lastName: data.lastname,
			jwt: data.jwt,
			// nicename: data.nicename,
		};

		try {
			const wpUser = await wpCredentialsCollection
				.findOne({
					selector: { id: data.user_id },
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
				oldData.wpCredentials.push(newWpUser._id);
				return oldData;
			});

			return newWpUser;
		} catch (error) {
			throw Error(error);
		}
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
	getWpCredentials$(this: SiteDocument) {
		return this.wpCredentials$.pipe(
			switchMap(async () => {
				const wpCredentials = await this.populate('wpCredentials');
				return wpCredentials;
			})
		);
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
