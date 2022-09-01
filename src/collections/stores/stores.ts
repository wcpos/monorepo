import schema from './schema.json';
import { removeStoreDB } from '../..';

export type StoreSchema = import('./interface').WCPOSStoreSchema;
export type StoreDocument = import('rxdb').RxDocument<StoreSchema, StoreMethods>;
export type StoreCollection = import('rxdb').RxCollection<
	StoreDocument,
	StoreMethods,
	StoreStatics
>;
type StoreMethods = Record<string, never>;
type StoreStatics = Record<string, never>;

function sanitizeStoreName(id: string) {
	return `store_${id.replace(':', '_')}`;
}

/**
 *
 */
async function preRemove(this: StoreCollection, plainData: any, store: StoreDocument) {
	return removeStoreDB(plainData.localID);
}

export const stores = {
	schema,
	// statics: {},
	// methods: {},
	// attachments: {},
	options: {
		middlewares: {
			preRemove: {
				handle: preRemove,
				parallel: false,
			},
		},
	},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
	// localDocuments: true,
};
