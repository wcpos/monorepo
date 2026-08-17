import {
	engineCollectionNameFor,
	type EngineRecord,
	type EngineRxDocument,
	isEngineRxDocument,
	type LegacyCollectionName,
	resolveLegacyField,
	wrapEngineDocument,
} from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

type QueryManager = ReturnType<typeof import('@wcpos/query').useQueryRuntime>;

type EngineCollection = {
	find(query?: { selector: Record<string, unknown> }): {
		exec(): Promise<unknown>;
	};
};

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

export async function readEngineProductRecordsByWooId(manager: QueryManager, wooIds: number[]) {
	if (wooIds.length === 0) return [];
	const collectionName = 'products' as const;
	const collection = activeCollection(manager, collectionName);
	if (!collection) return [];
	const wooIdPath = resolveLegacyField(collectionName, 'id').enginePath;
	const remoteIds = wooIds.map(remoteIdOrNull).filter((remoteId) => remoteId !== null);
	const result = await collection.find({ selector: { [wooIdPath]: { $in: remoteIds } } }).exec();
	return engineDocuments(result) as unknown as EngineRecord<'products'>[];
}

export async function readEngineProductsByWooId(manager: QueryManager, wooIds: number[]) {
	const records = await readEngineProductRecordsByWooId(manager, wooIds);
	return records.map((record) =>
		wrapEngineDocument<import('@wcpos/database').ProductDocument>('products', record as never)
	);
}

export async function readEngineCategories(manager: QueryManager) {
	const collection = activeCollection(manager, 'products/categories');
	if (!collection) return [];
	return engineDocuments(await collection.find().exec()) as unknown as EngineRecord<'categories'>[];
}
