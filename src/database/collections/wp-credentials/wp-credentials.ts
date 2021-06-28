import { Observable } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import get from 'lodash/get';
import forEach from 'lodash/forEach';
import schema from './schema.json';

type StoreCollection = import('../stores').StoreCollection;
type StoreDocument = import('../stores').StoreDocument;

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
type WPCredentialsStatics = Record<string, never>;

interface WPCredentialsMethods {
	addOrUpdateStores: (data: any[]) => Promise<void>;
	getStores$: () => Observable<StoreDocument[]>;
}

/**
 *
 */
export const methods: WPCredentialsMethods = {
	/**
	 *
	 */
	async addOrUpdateStores(this: WPCredentialsDocument, data: any[]) {
		const storesCollection: StoreCollection = get(this, 'collection.database.collections.stores');

		try {
			forEach(data, async (rawStore) => {
				const existingStore = await storesCollection
					.findOne({
						selector: { id: rawStore.id },
					})
					.exec();

				if (existingStore) {
					return existingStore.atomicPatch(rawStore);
				}

				const newStore = await storesCollection.insert(rawStore);
				return this.atomicUpdate((old) => {
					old.stores = old.stores || [];
					old.stores?.push(newStore._id);
					return old;
				});
			});
		} catch (error) {
			throw Error(error);
		}
	},

	/**
	 *
	 */
	getStores$(this: WPCredentialsDocument) {
		return this.stores$.pipe(
			switchMap(async (args: any) => {
				const stores = await this.populate('stores');
				return stores || [];
			})
		);
	},
};

export const wpCredentials = {
	schema,
	// pouchSettings: {},
	// statics,
	methods,
	// attachments: {},
	// options: {},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
};
