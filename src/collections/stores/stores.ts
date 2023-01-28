import { v4 as uuidv4 } from 'uuid';

import schema from './schema.json';

export type StoreSchema = import('./interface').WCPOSStoreSchema;
export type StoreDocument = import('rxdb').RxDocument<StoreSchema, StoreMethods>;
export type StoreCollection = import('rxdb').RxCollection<
	StoreDocument,
	StoreMethods,
	StoreStatics
>;
type StoreMethods = Record<string, never>;
type StoreStatics = Record<string, never>;

export const stores = {
	schema,
	// statics: {},
	// methods: {},
	// attachments: {},
	// options: {
	// 	middlewares: {
	// 		preInsert: {
	// 			handle: preInsert,
	// 			parallel: true,
	// 		},
	// 	},
	// },
	// migrationStrategies: {},
	// autoMigrate: true,
	// cacheReplacementPolicy() {},
	// localDocuments: true,
};
