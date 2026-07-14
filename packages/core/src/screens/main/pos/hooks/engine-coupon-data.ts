import {
	engineCollectionNameFor,
	type LegacyCollectionName,
	resolveLegacyField,
} from '@wcpos/query/engine-adapter/collection-map';
import { wrapEngineDocument } from '@wcpos/query/engine-adapter/document-proxy';

type EngineRxDocument = Parameters<typeof wrapEngineDocument>[1];
type QueryManager = ReturnType<typeof import('@wcpos/query').useQueryManager>;

type EngineCollection = {
	find(query?: { selector: Record<string, unknown> }): {
		exec(): Promise<unknown>;
	};
};

function isEngineRxDocument(value: unknown): value is EngineRxDocument {
	if (value === null || typeof value !== 'object') return false;
	const candidate = value as {
		id?: unknown;
		payload?: unknown;
		getLatest?: unknown;
		collection?: unknown;
	};
	return (
		typeof candidate.id === 'string' &&
		candidate.payload !== null &&
		typeof candidate.payload === 'object' &&
		typeof candidate.getLatest === 'function' &&
		candidate.collection !== null &&
		typeof candidate.collection === 'object'
	);
}

function activeCollection(
	manager: QueryManager,
	collectionName: LegacyCollectionName
): EngineCollection | null {
	const collection =
		manager.engine.active()?.database.collections[engineCollectionNameFor(collectionName)];
	return (collection as unknown as EngineCollection | undefined) ?? null;
}

function engineDocuments(value: unknown): EngineRxDocument[] {
	return Array.isArray(value) ? value.filter(isEngineRxDocument) : [];
}

async function readAll<TDocument extends object>(
	manager: QueryManager,
	collectionName: LegacyCollectionName
): Promise<TDocument[]> {
	const collection = activeCollection(manager, collectionName);
	if (!collection) return [];
	const result = await collection.find().exec();
	return engineDocuments(result).map((document) =>
		wrapEngineDocument<TDocument>(collectionName, document)
	);
}

export function readEngineCoupons(manager: QueryManager) {
	return readAll<import('@wcpos/database').CouponDocument>(manager, 'coupons');
}

export async function readEngineProductsByWooId(manager: QueryManager, wooIds: number[]) {
	if (wooIds.length === 0) return [];
	const collectionName = 'products' as const;
	const collection = activeCollection(manager, collectionName);
	if (!collection) return [];
	const wooIdPath = resolveLegacyField(collectionName, 'id').enginePath;
	const result = await collection.find({ selector: { [wooIdPath]: { $in: wooIds } } }).exec();
	return engineDocuments(result).map((document) =>
		wrapEngineDocument<import('@wcpos/database').ProductDocument>(collectionName, document)
	);
}

export function readEngineCategories(manager: QueryManager) {
	return readAll<import('@wcpos/database').ProductCategoryDocument>(manager, 'products/categories');
}
