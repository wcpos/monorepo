import log from '@wcpos/utils/src/logger';
import forEach from 'lodash/forEach';
import get from 'lodash/get';
import remove from 'lodash/remove';
import { ObservableResource } from 'observable-hooks';
import { Observable } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';

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
	addStore: (data: Record<string, any>) => Promise<StoreDocument>;
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
		const stores = await this.populate('stores');

		forEach(data, async (rawStore) => {
			const existingStore = remove(stores, { id: rawStore.id });

			if (existingStore.length > 1) {
				log.error('this should not happen');
				debugger;
			} else if (existingStore.length === 1) {
				// update existing store
				// @ts-ignore
				await existingStore[0].atomicPatch(rawStore);
			} else {
				// create new store
				const newStore = await storesCollection.insert(rawStore);
				await this.atomicUpdate((old: any) => {
					old.stores = old.stores || [];
					old.stores?.push(newStore.localID);
					return old;
				});
			}

			if (Array.isArray(stores) && stores.length > 0) {
				log.error('these stores need to be removed');
				debugger;
			}
		});
	},

	/**
	 *
	 */
	async addStore(this: WPCredentialsDocument, data) {
		const store: StoreDocument = await this.collection.database.collections.stores.insert(data);
		await this.update({ $push: { stores: store.localID } }).catch((err) => {
			log.error(err);
			return err;
		});

		return store;
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
	// statics,
	methods,
	// attachments: {},
	options: {
		middlewares: {
			postCreate: {
				handle: (data, wpCredentials) => {
					const populatedStores$ = wpCredentials.stores$.pipe(
						switchMap(async (args: any) => {
							const stores = await wpCredentials.populate('stores');
							return stores || [];
						})
					);
					Object.assign(wpCredentials, {
						populatedStores$,
						storesResource: new ObservableResource(populatedStores$),
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
