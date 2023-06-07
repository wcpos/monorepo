import { RxPlugin } from 'rxdb';
import { Subject } from 'rxjs';

import { storeCollections } from '../';

import type { StoreDatabaseCollections } from '../';

type CollectionKey = keyof typeof storeCollections;

const reset = new Subject<StoreDatabaseCollections[keyof StoreDatabaseCollections]>();

/**
 * This plugin adds a `reset` method to collections.
 *
 * This is similar to the `remove` method, but it also re-adds the collection so
 * it can be used in place.
 *
 * I'm using this to add a 'clear and sync' option so users can blast their local
 * storage in case something goes wrong.
 */
export const resetCollectionPlugin: RxPlugin = {
	name: 'reset-collection',
	rxdb: true,
	prototypes: {
		RxDatabase: (proto) => {
			proto.reset$ = reset.asObservable();
			proto.reset = async function (this, collectionKeys: CollectionKey[]) {
				const keys = Array.isArray(collectionKeys) ? collectionKeys : [collectionKeys];
				const promises = keys.map(async (key) => {
					const collection = this.collections[key];
					await collection.remove();
					const collections = await this.addCollections({ [key]: storeCollections[key] });
					reset.next(collections[key]);
					return collections[key];
				});
				const collections = await Promise.all(promises);
				return collections;
			};
		},
	},
	overwritable: {},
	hooks: {},
};
