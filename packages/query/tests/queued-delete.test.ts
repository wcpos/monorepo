import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { recordMutationQueueSchema } from '@wcpos/sync-core';

import { hasQueuedDelete } from '../src/reads/queued-delete';

it('the queued-delete read excludes superseded deletes', async () => {
	const storage = getRxStorageMemory();
	const db = await createRxDatabase({ name: 'queueddelete', storage, multiInstance: false });
	try {
		await db.addCollections({ recordMutations: { schema: recordMutationQueueSchema } });
		const row = await db.collections.recordMutations.insert({
			mutationId: 'delete',
			collectionName: 'orders',
			recordId: 'order',
			operation: 'delete',
			origin: 'existing',
			payload: {},
			baseRevision: null,
			queuedAt: new Date().toISOString(),
			supersededBy: 'coalesce:writer',
		});
		expect(await hasQueuedDelete(db, 'orders', 'order')).toBe(false);
		await row.modify(({ supersededBy: _, ...data }) => data);
		expect(await hasQueuedDelete(db, 'orders', 'order')).toBe(true);
	} finally {
		await db.remove();
	}
});
