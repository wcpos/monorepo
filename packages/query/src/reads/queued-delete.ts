import { MUTATION_QUEUE_RXDB_COLLECTION } from '@wcpos/sync-engine';

import type { RxDatabase } from 'rxdb';

export async function hasQueuedDelete(db: RxDatabase, collectionName: string, recordId: string) {
	const rows = await db.collections[MUTATION_QUEUE_RXDB_COLLECTION].find({
		selector: { collectionName, recordId, operation: 'delete' },
	}).exec();
	return rows.some(
		(row) => row.status !== 'internal' && !row.supersededBy?.startsWith('coalesce:')
	);
}
