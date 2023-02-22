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
};
