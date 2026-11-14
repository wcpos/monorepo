import type { RxdbSyncEngine } from '@wcpos/sync-engine';
import { remoteIdOrNull } from '@wcpos/sync-core';

import { engineCollection } from '../records/engine-collection';

import type { EngineRecord, EngineRecordCollectionName } from '../records/engine-record';

function activeCollection<C extends EngineRecordCollectionName>(engine: RxdbSyncEngine, name: C) {
	return engineCollection(engine.active()?.database, name);
}

async function readEngineCoupons(engine: RxdbSyncEngine): Promise<EngineRecord<'coupons'>[]> {
	const collection = activeCollection(engine, 'coupons');
	if (!collection) return [];
	return collection.find().exec();
}

async function readEngineProductRecordsByWooId(engine: RxdbSyncEngine, wooIds: number[]) {
	if (wooIds.length === 0) return [];
	const collection = activeCollection(engine, 'products');
	if (!collection) return [];
	const remoteIds = wooIds.map(remoteIdOrNull).filter((remoteId) => remoteId !== null);
	return collection.find({ selector: { remoteKey: { $in: remoteIds } } }).exec();
}

async function readEngineCategories(engine: RxdbSyncEngine) {
	const collection = activeCollection(engine, 'categories');
	if (!collection) return [];
	return collection.find().exec();
}

export async function readCouponCatalog(engine: RxdbSyncEngine, productWooIds: number[]) {
	const [coupons, products, categories] = await Promise.all([
		readEngineCoupons(engine),
		readEngineProductRecordsByWooId(engine, productWooIds),
		readEngineCategories(engine),
	]);
	return { coupons, products, categories };
}
