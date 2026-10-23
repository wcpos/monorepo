import { MUTATION_QUEUE_RXDB_COLLECTION, type RxdbSyncEngine } from '@wcpos/sync-engine';

/** Whether the active scope's write queue holds a live delete of this order. */
export async function orderHasQueuedDelete(engine: Pick<RxdbSyncEngine, 'active'>, uuid: string) {
	const db = engine.active()?.database;
	// Thrown, not guessed: the caller keeps its state and the next pass retries.
	if (!db) throw new Error('No active scope to read the write queue from');
	const rows = await db.collections[MUTATION_QUEUE_RXDB_COLLECTION].find({
		selector: { collectionName: 'orders', recordId: uuid, operation: 'delete' },
	}).exec();
	return rows.some(
		(row) => row.status !== 'internal' && !row.supersededBy?.startsWith('coalesce:')
	);
}
