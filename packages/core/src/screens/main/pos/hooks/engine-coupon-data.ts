import {
	engineCollection,
	type EngineRecord,
	type EngineRecordCollectionName,
	wrapEngineDocument,
} from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

type QueryManager = ReturnType<typeof import('@wcpos/query').useQueryRuntime>;

function activeCollection<C extends EngineRecordCollectionName>(manager: QueryManager, name: C) {
	return engineCollection(manager.engine.active()?.database, name);
}

export async function readEngineCoupons(manager: QueryManager): Promise<EngineRecord<'coupons'>[]> {
	const collection = activeCollection(manager, 'coupons');
	if (!collection) return [];
	return collection.find().exec();
}

export async function readEngineProductRecordsByWooId(manager: QueryManager, wooIds: number[]) {
	if (wooIds.length === 0) return [];
	const collection = activeCollection(manager, 'products');
	if (!collection) return [];
	const remoteIds = wooIds.map(remoteIdOrNull).filter((remoteId) => remoteId !== null);
	return collection.find({ selector: { remoteId: { $in: remoteIds } } }).exec();
}

export async function readEngineProductsByWooId(manager: QueryManager, wooIds: number[]) {
	const records = await readEngineProductRecordsByWooId(manager, wooIds);
	return records.map((record) =>
		wrapEngineDocument<import('@wcpos/database').ProductDocument>('products', record as never)
	);
}

export async function readEngineCategories(manager: QueryManager) {
	const collection = activeCollection(manager, 'categories');
	if (!collection) return [];
	return collection.find().exec();
}
