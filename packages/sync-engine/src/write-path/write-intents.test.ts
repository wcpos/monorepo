import { describe, expect, it } from 'vitest';

import type { QueuedMutation, RxRecordMutationCollection } from '@wcpos/sync-core';

import { enqueueWriteIntent, requeueBornTwiceSnapshot } from './write-intents';

import type { RxDatabase } from 'rxdb';

describe('enqueueWriteIntent', () => {
	it('strips non-string order meta display fields after coalescing over resident payload', async () => {
		const queued = new Map<string, QueuedMutation>();
		const mutationCollection: RxRecordMutationCollection = {
			bulkUpsert: async (items) => {
				for (const item of items) queued.set(item.mutationId, item);
				return { error: [] };
			},
			find: () => ({ exec: async () => [...queued.values()] }),
			bulkRemove: async (ids) => {
				for (const id of ids) queued.delete(id);
				return { error: [] };
			},
		};
		let residentData: Record<string, unknown> = {
			payload: {
				line_items: [
					{
						meta_data: [
							{
								key: '_woocommerce_pos_data',
								value: { price: '45' },
								display_value: { price: '45' },
							},
						],
					},
				],
			},
			sync: { revision: 'sha256:base-r1' },
			local: { dirty: false, pendingMutationIds: [] },
		};
		const resident = {
			incrementalModify: async (
				modify: (data: Record<string, unknown>) => Record<string, unknown>
			) => {
				residentData = modify(residentData);
			},
			remove: async () => undefined,
			toJSON: () => residentData,
		};
		const db = {
			collections: {
				orders: { findOne: () => ({ exec: async () => resident }) },
				recordMutations: mutationCollection,
			},
		} as unknown as RxDatabase;
		let nextMutationId = 0;
		const mintUuid = () => `mutation-${++nextMutationId}`;
		const now = () => '2026-07-27T00:00:00.000Z';

		await enqueueWriteIntent({
			db,
			intent: {
				collection: 'orders',
				operation: 'update',
				recordId: 'order-1',
				payload: { status: 'completed' },
			},
			mintUuid,
			now,
		});
		await enqueueWriteIntent({
			db,
			intent: {
				collection: 'orders',
				operation: 'update',
				recordId: 'order-1',
				payload: { customer_note: 'ring twice' },
			},
			mintUuid,
			now,
		});

		expect([...queued.values()]).toHaveLength(1);
		expect([...queued.values()][0]?.payload).toMatchObject({
			line_items: [
				{
					meta_data: [{ key: '_woocommerce_pos_data', value: { price: '45' } }],
				},
			],
		});
		expect(
			(
				(
					[...queued.values()][0]?.payload.line_items as {
						meta_data: Record<string, unknown>[];
					}[]
				)[0]?.meta_data[0] ?? {}
			).display_value
		).toBeUndefined();
	});

	it('strips non-string order meta display fields from a born-twice follow-up', async () => {
		const queued = new Map<string, QueuedMutation>();
		const mutationCollection: RxRecordMutationCollection = {
			bulkUpsert: async (items) => {
				for (const item of items) queued.set(item.mutationId, item);
				return { error: [] };
			},
			find: () => ({ exec: async () => [...queued.values()] }),
			bulkRemove: async (ids) => {
				for (const id of ids) queued.delete(id);
				return { error: [] };
			},
		};
		const db = {
			collections: {
				orders: { findOne: () => ({ exec: async () => null }) },
				recordMutations: mutationCollection,
			},
		} as unknown as RxDatabase;

		await requeueBornTwiceSnapshot({
			db,
			mutation: {
				mutationId: 'create-1',
				collectionName: 'orders',
				operation: 'create',
				recordId: 'order-1',
				origin: 'minted',
				payload: {
					meta_data: [
						{
							key: '_woocommerce_pos_data',
							value: { price: '45' },
							display_value: { price: '45' },
						},
					],
				},
				baseRevision: null,
				queuedAt: '2026-07-27T00:00:00.000Z',
			},
			ackRevision: 'sha256:server-r1',
			mintUuid: () => 'follow-up-1',
			now: () => '2026-07-27T00:00:01.000Z',
		});

		expect([...queued.values()]).toHaveLength(1);
		expect([...queued.values()][0]?.payload.meta_data).toEqual([
			{ key: '_woocommerce_pos_data', value: { price: '45' } },
		]);
	});
});
