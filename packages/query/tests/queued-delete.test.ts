import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { recordMutationQueueSchema } from '@wcpos/sync-core';

import { orderHasQueuedDelete } from '../src/reads/queued-delete';

import type { RxDatabase } from 'rxdb';

const engineOver = (database: RxDatabase | null) => ({
	active: () => (database ? { database } : null) as never,
});

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
		expect(await orderHasQueuedDelete(engineOver(db), 'order')).toBe(false);
		await row.modify(({ supersededBy: _, ...data }) => data);
		expect(await orderHasQueuedDelete(engineOver(db), 'order')).toBe(true);
	} finally {
		await db.remove();
	}
});

it('the queued-delete read retains void-marked deletes', async () => {
	const db = await createRxDatabase({
		name: 'voiddelete',
		storage: getRxStorageMemory(),
		multiInstance: false,
	});
	try {
		await db.addCollections({ recordMutations: { schema: recordMutationQueueSchema } });
		await db.collections.recordMutations.insert({
			mutationId: 'delete',
			collectionName: 'orders',
			recordId: 'order',
			operation: 'delete',
			origin: 'existing',
			payload: {},
			baseRevision: null,
			queuedAt: new Date().toISOString(),
			supersededBy: 'void-token',
		});
		expect(await orderHasQueuedDelete(engineOver(db), 'order')).toBe(true);
	} finally {
		await db.remove();
	}
});

it('the queued-delete read throws with no active scope', async () => {
	await expect(orderHasQueuedDelete(engineOver(null), 'order')).rejects.toThrow(
		'No active scope to read the write queue from'
	);
});
