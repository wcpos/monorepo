import schema from './schema.json';
// import DatabaseService from '../../index';

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
	// @ts-ignore
	const storeDB = DatabaseService.getStoreDB(sanitizeStoreName(plainData.localID));
	// @ts-ignore
	return storeDB.remove();
}

export const stores = {
	schema,
	// pouchSettings: {},
	// statics: {},
	// methods: {},
	// attachments: {},
	options: {
		// middlewares: {
		// 	preRemove: {
		// 		handle: preRemove,
		// 		parallel: false,
		// 	},
		// },
	},
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
	localDocuments: true,
};
