import { RxPlugin } from 'rxdb';
import { Subject } from 'rxjs';

import {
	StoreCollections,
	storeCollections,
	SyncCollections,
	syncCollections,
} from '../collections';

type CollectionKey = keyof typeof storeCollections;

const storeReset = new Subject<StoreCollections[keyof StoreCollections]>();
const syncReset = new Subject<SyncCollections[keyof SyncCollections]>();

/**
 *
 */
export const resetCollectionPlugin: RxPlugin = {
	name: 'reset-collection',
	rxdb: true,
	prototypes: {
		// RxDatabase: (proto) => {
		// 	if (proto.name.startsWith('fast_store')) {
		// 		proto.reset$ = syncReset.asObservable();
		// 	} else {
		// 		proto.reset$ = storeReset.asObservable();
		// 	}
		// },
	},
	overwritable: {},
	hooks: {
		createRxDatabase: {
			after: ({ database }) => {
				if (database.name.startsWith('fast_store')) {
					database.reset$ = syncReset.asObservable();
				} else if (database.name.startsWith('store')) {
					database.reset$ = storeReset.asObservable();
				}
			},
		},
		postCloseRxCollection: {
			/**
			 * Automatically re-add the collection after it's destroyed
			 */
			after: async (collection) => {
				const database = collection.database;
				const key = collection.name;

				// @FIXME - hacky way to ignore search collectins (we don't want to re-add them here)
				if (key.endsWith('flexsearch')) {
					return;
				}
				try {
					if (database.name.startsWith('fast_store')) {
						const cols = await database.addCollections({ [key]: syncCollections[key] });
						syncReset.next(cols[key]);
					} else if (database.name.startsWith('store')) {
						const cols = await database.addCollections({ [key]: storeCollections[key] });
						storeReset.next(cols[key]);
					}
				} catch (error) {
					console.error(error);
				}
			},
		},
	},
};
