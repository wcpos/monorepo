import { afterEach, describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { mintRemoteId, normalizeCheckpoint } from '@wcpos/sync-core';

import { createEngineHarness } from '../testing';
import { materializeLocalOnly, materializeRefund } from '../materialization/record-materialization';
import { writeFacetFor } from '../collections/collection-descriptors';
import {
	applyOrderSnapshot,
	createOrdersSchedulerFetcher,
} from '../scheduler/rx-scheduler-order-fetcher';
import { EngineOrderRepository } from './engine-order-repository';

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
			(await h.collection('refunds').find().exec()).map((doc) => doc.toJSON().payload.id).sort(),
	};
}
describe('order refund reconciliation', () => {
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
	it.each(['delete', 'resync', 'ack', 'reset'] as const)(
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
			if (action === 'reset') await h.engine.scope.resetCollection('orders');
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
