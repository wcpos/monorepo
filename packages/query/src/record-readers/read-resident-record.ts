import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { findEngineResident, type QueryManager } from '../mutations/resident';
import { engineCollection } from '../records/engine-collection';

import type { EngineRecord, EngineRecordCollectionName } from '../records/engine-record';

/** One-shot resident read; storage failures propagate to the caller's diagnostics. */
export async function readResidentRecord<C extends EngineRecordCollectionName>(
	engine: RxdbSyncEngine,
	collectionName: C,
	recordId: string
): Promise<EngineRecord<C> | null> {
	const collection = engineCollection(engine.active()?.database, collectionName);
	return collection ? collection.findOne(recordId).exec() : null;
}

/** Wait for the scope before reading: completion replay can mount during cold boot. */
export async function readResidentOrder(
	manager: QueryManager,
	uuid: string
): Promise<EngineRecord<'orders'> | null> {
	return (await findEngineResident(
		manager,
		'orders',
		uuid
	)) as unknown as EngineRecord<'orders'> | null;
}
