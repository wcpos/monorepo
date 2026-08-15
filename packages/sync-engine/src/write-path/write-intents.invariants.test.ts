import { describe, expect, it, vi } from 'vitest';

import { createFakeMutationCollection } from '@wcpos/sync-core/testing';
import type { QueuedMutation } from '@wcpos/sync-core';

import { queueFor, requeueBornTwiceSnapshot } from './write-intents';

import type { RxDatabase } from 'rxdb';

const mutation: QueuedMutation = {
	mutationId: 'create',
	collectionName: 'orders',
	operation: 'create',
	recordId: 'order-1',
	origin: 'minted',
	payload: { status: 'processing' },
	baseRevision: null,
	queuedAt: '2026-08-07T00:00:00.000Z',
};

describe('requeueBornTwiceSnapshot failure contract', () => {
	it.each(['queue-read', 'mint', 'coalesce', 'append', 'bookkeeping'] as const)(
		'throws when %s fails instead of returning null',
		async (failure) => {
			const mutationCollection = createFakeMutationCollection();
			const resident = {
				incrementalModify: async () => {
					if (failure === 'bookkeeping') throw new Error('bookkeeping failed');
				},
				remove: async () => undefined,
				toJSON: () => ({}),
			};
			const database = {
				collections: {
					orders: { findOne: () => ({ exec: async () => resident }) },
					recordMutations: mutationCollection,
				},
			} as unknown as RxDatabase;
			const queue = queueFor(database);
			if (failure === 'coalesce') {
				await queue.enqueue({
					...mutation,
					mutationId: 'successor',
					operation: 'update',
					origin: 'existing',
				});
				vi.spyOn(queue, 'coalesceInto').mockRejectedValue(new Error('coalesce failed'));
			} else if (failure === 'queue-read') {
				vi.spyOn(queue, 'pending').mockRejectedValue(new Error('queue read failed'));
			} else if (failure === 'append') {
				vi.spyOn(queue, 'enqueueWhen').mockRejectedValue(new Error('append failed'));
			}

			await expect(
				requeueBornTwiceSnapshot({
					db: database,
					mutation,
					ackRevision: 'sha256:server',
					mintUuid: () => {
						if (failure === 'mint') throw new Error('mint failed');
						return 'follow-up';
					},
					now: () => '2026-08-07T00:00:01.000Z',
				})
			).rejects.toThrow(/failed/);
		}
	);
});
