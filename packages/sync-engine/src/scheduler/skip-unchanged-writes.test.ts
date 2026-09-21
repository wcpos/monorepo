import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { mintRemoteId, type OrderDocument } from '@wcpos/sync-core';

import { createEngineHarness } from '../engine-harness';
import { referenceCollectionRepository } from '../collections/rx-reference-collection-repository';
import { EngineOrderRepository } from '../write-path/engine-order-repository';
import { collectionSchedulerRepository } from './engine-scheduler-drain';

import type { LocalReferenceDocument } from '../collections/reference-collection-schema';

type PullDocument = OrderDocument & LocalReferenceDocument;

setPremiumFlag();
afterEach(createEngineHarness.disposeTrackedEngines);

// Removing the shared filter must fail the zero-write assertion for every adapter.
describe.each([
	'products',
	'variations',
	'customers',
	'orders',
	'tags',
	'categories',
	'brands',
	'coupons',
])('%s pull writes', (name) => {
	it('skips identical pages without losing applied coverage, writes changes and resurrects tombstones', async () => {
		const harness = await createEngineHarness({ captureTimers: true });
		const collection = harness.collection<PullDocument>(name);
		const repository =
			name === 'orders'
				? new EngineOrderRepository(collection.database as never)
				: ['tags', 'categories', 'brands', 'coupons'].includes(name)
					? referenceCollectionRepository(collection as never)
					: collectionSchedulerRepository<PullDocument>(collection);
		const page = [1, 2].map((id): PullDocument => {
			const document: PullDocument = {
				uuid: `document-${id}`,
				remoteId: mintRemoteId(id, 'fixture'),
				payload: {
					id,
					name: `Original ${id}`,
					meta_data: [{ key: 'nested', value: { a: [1, 2] } }],
				},
				sync: {
					revision: '1',
					partial: false,
					source: 'woo-rest',
					checkpoint: { updatedAtGmt: '', orderId: 0, revision: '1', sequence: 0 },
				},
				local: { dirty: false, pendingMutationIds: [] },
			};
			if (name === 'products')
				return Object.assign(document, {
					price: 0,
					stockStatus: '',
					type: '',
					categoryIds: [],
					brandIds: [],
					onSale: false,
					featured: false,
					stockQuantity: null,
				});
			if (name === 'variations')
				return Object.assign(document, {
					parentRemoteId: 'woo:10',
					price: 0,
					stockStatus: '',
					attributes: [],
					stockQuantity: null,
				});
			return document;
		});
		const bulkUpsert = vi.spyOn(collection, 'bulkUpsert');
		const bulkWrite = vi.spyOn(collection.storageInstance, 'bulkWrite');
		const changed = vi.fn();
		const subscription = collection.$.subscribe(changed);
		try {
			await repository.upsertMany(page);
			expect(bulkUpsert).toHaveBeenCalledTimes(1);
			expect(changed).toHaveBeenCalledTimes(2);
			bulkUpsert.mockClear();
			bulkWrite.mockClear();
			changed.mockClear();
			const read = vi.spyOn(collection, 'findByIds');
			const applied = await repository.upsertMany(page);
			expect(bulkUpsert).not.toHaveBeenCalled();
			expect(bulkWrite).not.toHaveBeenCalled();
			expect(changed).not.toHaveBeenCalled();
			expect(read).toHaveBeenCalledTimes(1);
			expect(applied).toEqual(page);
			const update = {
				...page[1],
				payload: { ...page[1].payload, meta_data: [{ key: 'nested', value: { a: [2, 1] } }] },
			};
			await repository.upsertMany([page[0], update]);
			expect(bulkUpsert).toHaveBeenCalledTimes(1);
			expect(bulkUpsert.mock.calls[0][0].map((doc) => doc.uuid)).toEqual(['document-2']);
			expect(changed).toHaveBeenCalledTimes(1);
			expect((await collection.findOne(update.uuid).exec())?.toJSON().payload).toEqual(
				update.payload
			);
			await (await collection.findOne(page[0].uuid).exec())!.remove();
			bulkUpsert.mockClear();
			await repository.upsertMany([page[0]]);
			expect(bulkUpsert).toHaveBeenCalledTimes(1);
			expect(await collection.findOne(page[0].uuid).exec()).not.toBeNull();
			await (await collection.findOne(page[0].uuid).exec())!.incrementalPatch({
				local: { dirty: true, pendingMutationIds: [] },
			});
			bulkUpsert.mockClear();
			expect(await repository.upsertMany([page[0]])).toEqual([]);
			expect(bulkUpsert).not.toHaveBeenCalled();
		} finally {
			subscription.unsubscribe();
		}
	});
});

it('compares real RxDB defaults without modifying the incoming page', async () => {
	const harness = await createEngineHarness({ captureTimers: true });
	const { defaults } = await harness.collection('products').database.addCollections({
		defaults: {
			schema: {
				version: 0,
				primaryKey: 'uuid',
				type: 'object',
				properties: {
					uuid: { type: 'string', maxLength: 100 },
					enabled: { type: 'boolean', default: false },
				},
				required: ['uuid', 'enabled'],
			},
		},
	});
	const repository = collectionSchedulerRepository<{ uuid: string; enabled?: boolean }>(defaults);
	const incoming = [{ uuid: 'a' }];
	await repository.upsertMany(incoming);
	expect((await defaults.findOne('a').exec())?.get('enabled')).toBe(false);
	const write = vi.spyOn(defaults, 'bulkUpsert');
	await repository.upsertMany(incoming);
	expect(write).not.toHaveBeenCalled();
	expect(incoming).toEqual([{ uuid: 'a' }]);
	await repository.upsertMany([{ uuid: 'a', enabled: true }]);
	expect(write).toHaveBeenCalledTimes(1);
});
