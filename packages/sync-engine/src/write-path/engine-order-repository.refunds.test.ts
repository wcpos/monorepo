import { afterEach, describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { mintRemoteId, normalizeCheckpoint } from '@wcpos/sync-core';

import { createEngineHarness } from '../testing';
import { materializeLocalOnly, materializeRefund } from '../materialization/record-materialization';
import { writeFacetFor } from '../collections/collection-descriptors';
import {
	applyOrderSnapshot,
	createOrdersSchedulerFetcher,
} from '../scheduler/rx-scheduler-order-fetcher';
import * as refundSeeder from '../scheduler/rx-refund-scheduler-task-seeder';
import { EngineOrderRepository } from './engine-order-repository';

import type { LocalRefundDocument } from '../collections/refund-schema';

setPremiumFlag();
let sequence = 0;
afterEach(() => createEngineHarness.disposeTrackedEngines());
const parent = (id: number, refunds: unknown = [{ id: 1 }]) =>
	materializeLocalOnly({
		id,
		status: 'completed',
		refunds,
		meta_data: [
			{
				key: '_woocommerce_pos_uuid',
				value: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
			},
		],
	} as never).storedDocument;
async function harness() {
	const h = await createEngineHarness({
		site: 'https://refund-reconcile.test',
		identity: { site: 'https://refund-reconcile.test', storeId: 1, cashierId: `c-${++sequence}` },
	});
	const scope = await h.engine.whenActive();
	const repo = new EngineOrderRepository(scope.database.collections as never);
	for (const [id, parent_id] of [
		[1, 42],
		[2, 42],
		[3, 43],
	]) {
		await h
			.collection('refunds')
			.insert(
				materializeRefund({ id, parent_id, date_created_gmt: '2026-09-01T00:00:00' }).storedDocument
			);
	}
	return {
		...h,
		repo,
		scope,
		ids: async () =>
			(await h.collection<LocalRefundDocument>('refunds').find().exec())
				.map((doc) => doc.toJSON().payload.id)
				.sort(),
	};
}
describe('order refund reconciliation', () => {
	// Remove the per-parent catch: one failed scheduler write rejects already-applied orders and skips 44.
	it('continues seeding later parents after one seed rejects without rejecting applied writes', async () => {
		const h = await harness();
		const seed = vi
			.spyOn(refundSeeder, 'seedRefundParentLane')
			.mockRejectedValueOnce(new Error('seed failed'));
		try {
			await expect(
				h.repo.upsertMany([parent(42, [{ id: 9 }]), parent(44, [{ id: 10 }])])
			).resolves.toHaveLength(2);
			expect(await h.collection('orders').find().exec()).toHaveLength(2);
			expect(
				(await h.scope.database.collections.schedulerTaskStates.find().exec()).map(
					(doc) => doc.toJSON().queryKey
				)
			).toContain('refunds:parent:44');
		} finally {
			seed.mockRestore();
		}
	});

	// Move the child cascade before parent removal: a failed delete destroys live refunds.
	it.each(['delete', 'resync'] as const)(
		'preserves children when %s parent removal fails',
		async (action) => {
			const h = await harness();
			await h.repo.upsertMany([parent(42, [{ id: 1 }, { id: 2 }])]);
			const remove = vi
				.spyOn(h.collection('orders'), 'bulkRemove')
				.mockRejectedValueOnce(new Error('parent remove failed'));
			try {
				await expect(
					action === 'delete'
						? h.repo.removeDeletedOrders([mintRemoteId(42, 'test')])
						: h.repo.resetForResync()
				).rejects.toThrow('parent remove failed');
				expect(await h.ids()).toEqual([1, 2, 3]);
			} finally {
				remove.mockRestore();
			}
		}
	);

	// Move the ack cascade above await doc.remove(): children disappear while removal is pending.
	it('waits for delete acknowledgement parent removal before cascading', async () => {
		const h = await harness();
		await h.repo.upsertMany([parent(42, [{ id: 1 }, { id: 2 }])]);
		const doc = (await h.collection('orders').findOne(parent(42).uuid).exec())!;
		let release!: () => void;
		let entered!: () => void;
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const original = doc.remove.bind(doc);
		const remove = vi.spyOn(doc, 'remove').mockImplementationOnce(async () => {
			entered();
			await pending;
			return original();
		});
		const ack = writeFacetFor('orders')!.onDeleteAck(h.scope.database, {
			recordId: parent(42).uuid,
		} as never);
		await started;
		try {
			expect(await h.ids()).toEqual([1, 2, 3]);
		} finally {
			release();
			await ack;
			remove.mockRestore();
		}
		expect(await h.ids()).toEqual([3]);
	});

	// Revert to returning when the parent is absent: retry leaves its refund children orphaned.
	it('retries the delete acknowledgement cascade after parent removal succeeded', async () => {
		const h = await harness();
		await h.repo.upsertMany([parent(42, [{ id: 1 }, { id: 2 }])]);
		const mutation = { mutationId: 'delete-parent', recordId: parent(42).uuid };
		const remove = vi
			.spyOn(h.collection('refunds'), 'bulkRemove')
			.mockRejectedValueOnce(new Error('child remove failed'));
		try {
			await expect(
				writeFacetFor('orders')!.onDeleteAck(h.scope.database, mutation)
			).rejects.toThrow('child remove failed');
			expect(await h.collection('orders').findOne(mutation.recordId).exec()).toBeNull();
			expect(await h.ids()).toEqual([1, 2, 3]);
			await writeFacetFor('orders')!.onDeleteAck(h.scope.database, mutation);
			expect(await h.ids()).toEqual([3]);
		} finally {
			remove.mockRestore();
		}
	});

	// Revert the current-parent reread: the older empty summary deletes refund 1.
	it('keeps a refund listed by the current parent after two upserts interleave', async () => {
		const h = await harness();
		let release!: () => void;
		let entered!: () => void;
		const paused = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const resume = new Promise<void>((resolve) => {
			release = resolve;
		});
		const refunds = h.collection('refunds');
		const originalFind = refunds.find.bind(refunds);
		const find = vi.spyOn(refunds, 'find').mockImplementationOnce((query) => {
			const result = originalFind(query);
			const exec = result.exec.bind(result);
			vi.spyOn(result, 'exec').mockImplementationOnce(async () => {
				const docs = await exec();
				entered();
				await resume;
				return docs;
			});
			return result;
		});
		const older = h.repo.upsertMany([parent(42, [])]);
		await paused;
		try {
			await h.repo.upsertMany([parent(42, [{ id: 1 }])]);
		} finally {
			release();
			await older;
			find.mockRestore();
		}
		expect(await h.ids()).toEqual([1, 3]);
	});

	// Restore the resident-order-only cascade: orphaned stamped refunds survive.
	it('cascades a tombstone even when its parent is not resident', async () => {
		const h = await harness();
		await h.collection('refunds').upsert(
			materializeRefund({
				id: 1,
				parent_id: 42,
				date_created_gmt: '',
				meta_data: [{ key: '_wcpos_session', value: 'B' }],
			}).storedDocument
		);
		await h.repo.removeDeletedOrders([mintRemoteId(42, 'test')]);
		expect(await h.ids()).toEqual([3]);
	});

	// Revert the batch lookup/removal to the per-parent loop: three reads and two removals.
	it('reads held refunds once and removes once for a batch of three parents', async () => {
		const h = await harness();
		const find = vi.spyOn(h.collection('refunds'), 'find');
		const remove = vi.spyOn(h.collection('refunds'), 'bulkRemove');
		await h.repo.upsertMany([parent(42, [{ id: 1 }]), parent(43, []), parent(44, [{ id: 9 }])]);
		expect(find).toHaveBeenCalledTimes(1);
		expect(find).toHaveBeenCalledWith({
			selector: { 'payload.parent_id': { $in: [42, 43, 44] } },
		});
		expect(remove).toHaveBeenCalledTimes(1);
		expect(await h.ids()).toEqual([1]);
		expect(
			(
				await h.scope.database.collections.schedulerTaskStates
					.find({ selector: { collectionName: 'refunds' } })
					.exec()
			).map((doc) => doc.toJSON().queryKey)
		).toEqual(['refunds:parent:44']);
	});
	it('prunes only this parent and seeds missing refund ids, not fully held summaries', async () => {
		const h = await harness();
		await h.repo.upsertMany([parent(42)]);
		expect(await h.ids()).toEqual([1, 3]);
		expect(
			await h.scope.database.collections.schedulerTaskStates
				.find({ selector: { collectionName: 'refunds' } })
				.exec()
		).toHaveLength(0);
		await h.repo.upsertMany([parent(42, [{ id: 1 }, { id: 9 }])]);
		expect(
			(
				await h.scope.database.collections.schedulerTaskStates
					.find({ selector: { collectionName: 'refunds' } })
					.exec()
			).map((doc) => doc.toJSON().queryKey)
		).toContain('refunds:parent:42');
	});
	it.each(['snapshot', 'targeted', 'custom'] as const)(
		'reconciles a parent arriving through %s ingestion',
		async (path) => {
			const h = await harness();
			const order = parent(42);
			if (path === 'snapshot') await applyOrderSnapshot({ repository: h.repo }, order.payload);
			else {
				const checkpoint = normalizeCheckpoint(null);
				const pull = createOrdersSchedulerFetcher({
					baseUrl: 'https://refund-reconcile.test/wp-json/wcpos/v2',
					repository: h.repo,
					checkpointStore: h.repo,
					fetcher: async () =>
						Response.json(
							path === 'targeted'
								? [order.payload]
								: {
										documents: [
											{
												id: order.uuid,
												payload: order.payload,
												sync: { ...order.sync, checkpoint },
												local: order.local,
											},
										],
										checkpoint,
										complete: true,
									}
						),
				});
				await pull({
					id: 'test',
					requirementId: 'test',
					collection: 'orders',
					limit: 25,
					priority: 500,
					queryKey: path === 'targeted' ? 'orders:ids:42' : 'orders:custom-pull',
					mode: path === 'targeted' ? 'on-demand' : 'windowed',
					...(path === 'targeted'
						? { remoteIds: [mintRemoteId(42, 'test')], documentIds: ['woo-order:42'] }
						: {}),
				});
			}
			expect(await h.ids()).toEqual([1, 3]);
		}
	);
	it('a parent journal update listing an unheld id schedules its by-parent walk', async () => {
		const h = await harness();
		await h.repo.upsertMany([parent(42, [{ id: 1 }, { id: 2 }, { id: 9 }])]);
		expect(
			(
				await h.scope.database.collections.schedulerTaskStates
					.find({ selector: { collectionName: 'refunds' } })
					.exec()
			).map((doc) => doc.toJSON().queryKey)
		).toEqual(['refunds:parent:42']);
	});
	it('reconciles unchanged accepted parents, including explicit empty summaries', async () => {
		const h = await harness();
		await h.repo.upsertMany([parent(42, [])]);
		await h
			.collection('refunds')
			.insert(materializeRefund({ id: 4, parent_id: 42, date_created_gmt: '' }).storedDocument);
		await h.repo.upsertMany([parent(42, [])]);
		expect(await h.ids()).toEqual([3]);
	});
	it.each([undefined, null, {}])(
		'preserves children without array authority (%s)',
		async (summary) => {
			const h = await harness();
			const order = parent(42);
			if (summary === undefined) delete order.payload.refunds;
			else order.payload.refunds = summary as never;
			await h.repo.upsertMany([order]);
			expect(await h.ids()).toEqual([1, 2, 3]);
			await h.repo.upsertMany([parent(42, [])]);
			expect(await h.ids()).toEqual([3]);
		}
	);
	it.each(['dirty', 'pending'] as const)('skips %s parents', async (protection) => {
		const h = await harness();
		await h.repo.upsertMany([parent(42, [{ id: 1 }, { id: 2 }])]);
		await h
			.collection('orders')
			.findOne(parent(42).uuid)
			.exec()
			.then((doc) =>
				doc!.incrementalPatch({
					local: {
						dirty: protection === 'dirty',
						pendingMutationIds: protection === 'pending' ? ['p'] : [],
					},
				})
			);
		await h.repo.upsertMany([parent(42, [{ id: 9 }])]);
		expect(await h.ids()).toEqual([1, 2, 3]);
		expect(
			await h.scope.database.collections.schedulerTaskStates
				.find({ selector: { collectionName: 'refunds' } })
				.exec()
		).toHaveLength(0);
		await h
			.collection('orders')
			.findOne(parent(42).uuid)
			.exec()
			.then((doc) => doc!.incrementalPatch({ local: { dirty: false, pendingMutationIds: [] } }));
		await h.repo.upsertMany([parent(42, [])]);
		expect(await h.ids()).toEqual([3]);
	});
	it.each(['delete', 'resync', 'ack'] as const)(
		'cascades %s without deleting unrelated refunds',
		async (action) => {
			const h = await harness();
			await h.repo.upsertMany([parent(42, [{ id: 1 }, { id: 2 }])]);
			if (action === 'delete') await h.repo.removeDeletedOrders([mintRemoteId(42, 'test')]);
			if (action === 'resync') await h.repo.resetForResync();
			if (action === 'ack')
				await writeFacetFor('orders')!.onDeleteAck(h.scope.database, {
					recordId: parent(42).uuid,
				} as never);
			expect(await h.ids()).toEqual([3]);
		}
	);
	it('delete and resync preserve a protected parent and its refunds', async () => {
		const h = await harness();
		await h.repo.upsertMany([parent(42, [{ id: 1 }, { id: 2 }])]);
		const pending = new Set([parent(42).uuid]);
		await h.repo.removeDeletedOrders([mintRemoteId(42, 'test')], pending);
		await h.repo.resetForResync(pending);
		expect(await h.ids()).toEqual([1, 2, 3]);
		await h.repo.resetForResync();
		expect(await h.ids()).toEqual([3]);
	});
});
