import {
	addRxPlugin,
	createRxDatabase,
	RxDatabase,
	toTypedRxJsonSchema,
	ExtractDocumentTypeFromTypedRxJsonSchema,
	RxJsonSchema,
} from 'rxdb';
// import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { RxDBGenerateIdPlugin } from './generate-id';

import { logsLiteral } from './schemas/logs';
import { productsLiteral } from './schemas/products';
import { syncLiteral } from './schemas/sync';
import { variationsLiteral } from './schemas/variations';

import type { RxCollectionCreator, RxCollection, RxDocument } from 'rxdb';

// addRxPlugin(RxDBDevModePlugin);
addRxPlugin(RxDBGenerateIdPlugin);

/**
 * Products
 */
const productsTyped = toTypedRxJsonSchema(productsLiteral);
const productSchema: RxJsonSchema<ProductDocumentType> = productsLiteral;
type ProductDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof productsTyped>;
export type ProductDocument = RxDocument<ProductDocumentType>;
export type ProductCollection = RxCollection<ProductDocumentType>;
const products: RxCollectionCreator<ProductDocumentType> = {
	schema: productSchema,
	options: {
		searchFields: ['name', 'sku', 'barcode'],
	},
};

/**
 * Product Variations
 */
const variationsTyped = toTypedRxJsonSchema(variationsLiteral);
const productVariationSchema: RxJsonSchema<ProductVariationDocumentType> = variationsLiteral;
type ProductVariationDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<
	typeof variationsTyped
>;
export type ProductVariationDocument = RxDocument<ProductVariationDocumentType>;
export type ProductVariationCollection = RxCollection<ProductVariationDocumentType>;
const variations: RxCollectionCreator<ProductVariationDocumentType> = {
	schema: productVariationSchema,
	options: {
		searchFields: ['sku', 'barcode'],
	},
};

/**
 * Sync
 */
const syncTyped = toTypedRxJsonSchema(syncLiteral);
const syncSchema: RxJsonSchema<SyncDocumentType> = syncLiteral;
type SyncDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof syncTyped>;
export type SyncDocument = RxDocument<SyncDocumentType>;
export type SyncCollection = RxCollection<SyncDocumentType>;
const sync: RxCollectionCreator<SyncDocumentType> = { schema: syncSchema };

/**
 * Logs
 */
const logsTyped = toTypedRxJsonSchema(logsLiteral);
const logSchema: RxJsonSchema<LogDocumentType> = logsLiteral;
type LogDocumentType = ExtractDocumentTypeFromTypedRxJsonSchema<typeof logsTyped>;
export type LogDocument = RxDocument<LogDocumentType>;
export type LogCollection = RxCollection<LogDocumentType>;
const logs: RxCollectionCreator<LogDocumentType> = { schema: logSchema };

/**
 *
 */
export async function createStoreDatabase(): Promise<RxDatabase> {
	const db = await createRxDatabase({
		name: 'storedb',
		storage: getRxStorageMemory(),
		ignoreDuplicate: true,
		allowSlowCount: true,
	});

	const collections = await db.addCollections({ products, variations, logs });

	return db;
}

/**
 *
 */
export async function createSyncDatabase(): Promise<RxDatabase> {
	const db = await createRxDatabase({
		name: 'syncdb',
		storage: getRxStorageMemory(),
		ignoreDuplicate: true,
		allowSlowCount: true,
	});

	const collections = await db.addCollections({ products: sync, variations: sync });

	return db;
}
