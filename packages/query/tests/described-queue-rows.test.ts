import { firstValueFrom } from 'rxjs';

import type { QueueRow } from '@wcpos/sync-engine';

import { observeDescribedQueueRows } from '../src/reads/described-queue-rows';
import { residentEngine } from './helpers/resident-engine';

it('joins residents and keeps per-row failures from rejecting the stream', async () => {
	const { engine } = residentEngine({
		collections: {
			products: {
				findOne: (id: string) => ({
					exec: async () => {
						if (id === 'failed') throw new Error('storage');
						return id === 'missing' ? null : { toJSON: () => ({ remoteId: null }) };
					},
				}),
			},
		},
	});
	engine.queueRows$ = (next) => {
		next(
			['ok', 'missing', 'failed'].map((recordId): QueueRow => ({
				mutationId: recordId,
				recordId,
				collectionName: 'products',
				operation: 'create',
				payload: {},
				queuedAt: '',
				status: 'rejected',
			}))
		);
		return () => {};
	};
	const rows = await firstValueFrom(observeDescribedQueueRows(engine));
	expect(rows.map(({ residentRead, discard }) => [residentRead, discard])).toEqual([
		['ok', 'destroys-record'],
		['missing', 'keeps-record'],
		['failed', 'unknown'],
	]);
	expect(rows[0].resident).toEqual({ remoteId: null });
});
