import {
	addRxPlugin,
	createRxDatabase,
	RxDatabase,
	toTypedRxJsonSchema,
	ExtractDocumentTypeFromTypedRxJsonSchema,
	RxJsonSchema,
} from 'rxdb';
import { RxDBQueryBuilderPlugin } from 'rxdb/plugins/query-builder';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { RxDBGenerateIdPlugin } from './generate-id';
import { parseRestResponsePlugin } from './parse-rest-response';
import { logsLiteral } from './schemas/logs';
import { productsLiteral } from './schemas/products';
import { syncLiteral } from './schemas/sync';
import { variationsLiteral } from './schemas/variations';
import { searchPlugin } from './search';

import type { RxCollectionCreator, RxCollection, RxDocument } from 'rxdb';

addRxPlugin(RxDBGenerateIdPlugin);
addRxPlugin(parseRestResponsePlugin);
addRxPlugin(searchPlugin);
addRxPlugin(RxDBQueryBuilderPlugin);

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
 * Generate a unique database name
 * Uses crypto for truly unique names that won't conflict with destroyed databases
 */
function generateUniqueDbName(baseName: string): string {
	// Use a combination of timestamp + high-resolution timer + random for uniqueness
	const timestamp = Date.now();
	const hrTime = typeof performance !== 'undefined' ? Math.floor(performance.now() * 1000) : 0;
	const random = Math.random().toString(36).substring(2, 10);
	return `${baseName}_${timestamp}_${hrTime}_${random}`;
}

/**
 *
 */
export async function createStoreDatabase(): Promise<RxDatabase> {
	const db = await createRxDatabase({
		name: generateUniqueDbName('storedb'),
		storage: getRxStorageMemory(),
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
		name: generateUniqueDbName('syncdb'),
		storage: getRxStorageMemory(),
		allowSlowCount: true,
	});

	const collections = await db.addCollections({ products: sync, variations: sync });

	return db;
}
