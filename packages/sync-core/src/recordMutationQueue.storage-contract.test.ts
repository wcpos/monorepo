import { describe, expect, it } from 'vitest';

import { createFakeMutationCollection } from './fakeMutationCollection';
import {
	InMemoryRecordMutationStorage,
	type QueuedMutation,
	type RecordMutationStorage,
	RxRecordMutationStorage,
} from './recordMutationQueue';

/**
 * ONE CONTRACT, BOTH STORAGES. The queue's logic is tested mostly on the
 * in-memory storage, so that storage only proves anything if the durable RxDB
 * storage writes a row the same way. `appendIfUnchanged` is a revision-checked
 * REPLACE of the row: after it lands, the row is exactly the mutation that was
 * written. A field the new row does not carry (a backoff gate, a drain lease, a
 * stored 409 document) must not survive from the old row, or a test that passes
 * on memory can hide a stale `nextAttemptAt` / `claimedBy` / `conflictDocument`
 * on a real device.
 *
 * The Rx storage runs over the shared RxDB-like fake (`fakeMutationCollection`),
 * the same one the sync-core Rx tests use: its NON-incremental `modify` writes
 * whatever the change function returns, as RxDB's `modify` does.
 */
const storages: [string, () => RecordMutationStorage][] = [
	['InMemoryRecordMutationStorage', () => new InMemoryRecordMutationStorage()],
	['RxRecordMutationStorage', () => new RxRecordMutationStorage(createFakeMutationCollection())],
];

const base: QueuedMutation = {
	mutationId: 'm1',
	collectionName: 'orders',
	operation: 'update',
	recordId: 'rec-A',
	origin: 'existing',
	payload: { id: 'rec-A' },
	baseRevision: null,
	queuedAt: '2026-06-26T00:00:00.000Z',
	seq: 1,
};

describe.each(storages)('%s — appendIfUnchanged contract', (_name, makeStorage) => {
	it('appendIfUnchanged leaves no field the new row did not carry', async () => {
		const storage = makeStorage();
		await storage.append({
			...base,
			status: 'claimed',
			attempts: 2,
			nextAttemptAt: '2026-06-26T00:05:00.000Z',
			claimedBy: 'window-A',
			claimedUntil: '2026-06-26T00:01:00.000Z',
			conflictDocument: { id: 'rec-A', total: '9.99' },
			conflictRevision: 'r-server',
		});
		const [{ rev }] = await storage.listStored();

		const replacement: QueuedMutation = {
			...base,
			status: 'pending',
			payload: { id: 'rec-A', v: 2 },
		};
		expect(await storage.appendIfUnchanged(replacement, rev)).toBe(true);

		const rows = await storage.list();
		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual(replacement);
		for (const key of ['nextAttemptAt', 'claimedBy', 'claimedUntil', 'conflictDocument']) {
			expect(rows[0]).not.toHaveProperty(key);
		}
	});
});
