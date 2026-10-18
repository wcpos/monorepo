import type { RxdbSyncEngine } from '@wcpos/sync-engine';

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
