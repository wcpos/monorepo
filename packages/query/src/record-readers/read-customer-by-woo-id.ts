import { remoteIdOrNull } from '@wcpos/sync-core';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { engineCollection } from '../records/engine-collection';

import type { EngineRecord } from '../records/engine-record';

/** One-shot customer read in the active scope; storage failures propagate to the caller. */
export async function readCustomerByWooId(
	engine: RxdbSyncEngine,
	wooId: number
): Promise<EngineRecord<'customers'> | null> {
	const remoteId = remoteIdOrNull(wooId);
	// A guest must never match a locally-created customer awaiting its remote id.
	if (remoteId === null) return null;
	const scope = await engine.whenActive();
	const collection = engineCollection(scope?.database, 'customers');
	return collection ? collection.findOne({ selector: { remoteId } }).exec() : null;
}
