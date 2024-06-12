import { RxPlugin } from 'rxdb';
import { Subject } from 'rxjs';

import { storeCollections, syncCollections, StoreCollections } from '../collections';

type CollectionKey = keyof typeof storeCollections;

const reset = new Subject<StoreCollections[keyof StoreCollections][]>();

/**
 * This plugin adds a `reset` method to collections.
 *
 * This is similar to the `remove` method, but it also re-adds the collection so
 * it can be used in place.
 *
 * I'm using this to add a 'clear and sync' option so users can blast their local
 * storage in case something goes wrong.
 *
 * @TODO - rxdb has a new RxCollection.onRemove hook that could be used to re-add the collection
 */
export const resetCollectionPlugin: RxPlugin = {
	name: 'reset-collection',
	rxdb: true,
	prototypes: {
		RxDatabase: (proto) => {
			proto.reset$ = reset.asObservable();
			proto.reset = async function (this, collectionKeys: CollectionKey[]) {
				let collectionsConfig = storeCollections;
				// @TODO - hacky way to check whether we're in sync db or not
				if (this.name.startsWith('fast_store')) {
					collectionsConfig = syncCollections;
				}

				const keys = Array.isArray(collectionKeys) ? collectionKeys : [collectionKeys];
				const promises = keys.map(async (key) => {
					const collection = this.collections[key];
					await collection.remove();
					const collections = await this.addCollections({ [key]: collectionsConfig[key] });
					return collections[key];
				});
				const collections = await Promise.all(promises);

				// emit the new collections together
				for (const collection of collections) {
					reset.next(collection);
				}

				return collections;
			};
		},
	},
	overwritable: {},
	hooks: {},
};
