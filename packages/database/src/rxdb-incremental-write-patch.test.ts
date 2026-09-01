/**
 * Pins the pnpm patch on rxdb@17.4.0 (patches/rxdb@17.4.0.patch).
 *
 * Upstream bug (https://github.com/pubkey/rxdb/pull/9026): triggerRun() has no
 * try/finally, so one rejected storage bulkWrite leaves isRunning=true forever;
 * the failing caller and every later incrementalModify() on the collection
 * hang, never settling. Our sync scheduler persists task state through
 * incrementalModify, so a single transient storage failure would silently
 * freeze it. If an rxdb upgrade drops the patch, the first expect here times
 * out instead of rejecting.
 */
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

describe('rxdb incremental-write patch', () => {
	it('rejects the caller and recovers after a rejected bulkWrite', async () => {
		const db = await createRxDatabase({
			name: 'incwrite-patch-pin-' + Date.now(),
			storage: getRxStorageMemory(),
		});
		await db.addCollections({
			docs: {
				schema: {
					version: 0,
					primaryKey: 'id',
					type: 'object',
					properties: {
						id: { type: 'string', maxLength: 20 },
						value: { type: 'number' },
					},
					required: ['id', 'value'],
				},
			},
		});
		const doc = await db.docs.insert({ id: 'd1', value: 0 });

		// Make the NEXT incremental write fail once at the storage layer.
		const storageInstance = db.docs.storageInstance;
		const realBulkWrite = storageInstance.bulkWrite.bind(storageInstance);
		let failedOnce = false;
		storageInstance.bulkWrite = (rows, context) => {
			if (context === 'incremental-write' && !failedOnce) {
				failedOnce = true;
				return Promise.reject(new Error('transient storage failure'));
			}
			return realBulkWrite(rows, context);
		};

		// Patched: the caller observes the storage error. Unpatched: this
		// promise never settles and jest times the test out.
		await expect(doc.incrementalPatch({ value: 1 })).rejects.toThrow('transient storage failure');

		// The queue must recover: the next write goes through.
		const updated = await doc.getLatest().incrementalPatch({ value: 2 });
		expect(updated.value).toBe(2);

		await db.close();
	});
});
