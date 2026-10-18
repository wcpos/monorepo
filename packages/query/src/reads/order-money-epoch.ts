import { readMoneyEpoch } from '@wcpos/order-math';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

/** Synchronous resident read: reconciliation and settlement already hold the RxDocument.
 * RxDB's doc cache drains pending change events here, just as getLatest() does.
 */
export function readResidentMoneyEpoch(engine: RxdbSyncEngine, uuid: string): number {
	const collection = engine.active()?.database.collections.orders;
	return readMoneyEpoch(
		collection?._docCache.getLatestDocumentDataIfExists(uuid)?.payload?.meta_data
	);
}
