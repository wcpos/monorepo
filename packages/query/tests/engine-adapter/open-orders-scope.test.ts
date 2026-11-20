/** @jest-environment node */
import { createRxDatabase } from 'rxdb';
import { filter, firstValueFrom } from 'rxjs';

import { NO_STORE, POS_META_KEYS } from '@wcpos/sync-core';
import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';

import {
	inOpenOrdersScope,
	OPEN_ORDERS_SORT,
	openOrdersSelector,
} from '../../src/open-orders-scope';
import { acquireOpenOrdersQueryHandle, type OpenOrdersScope } from '../../src/open-orders-scope';
import { queryHandleAnswers$ } from '../../src/query-handle';
import { canonicalQueryKey } from '../../src/query-state';
import { createFakeEngine, engineOrder } from '../../src/testing';
import { sqlitePlan } from '../helpers/sqlite-plan';
import { storages } from '../helpers/storages';

import type { EngineRecord } from '../../src/records/engine-record';
import type { RxCollectionCreator, RxDatabase } from 'rxdb';

describe.each(storages)('%s open-orders scope', (name, storage) => {
	let database: RxDatabase;
	it('uses promoted scope fields and creation sort', () => {
		expect(openOrdersSelector(7, 2)).toMatchObject({ posUserId: '7', posStoreId: '2' });
		expect(OPEN_ORDERS_SORT).toEqual([{ dateCreatedGmt: 'asc' }, { uuid: 'asc' }]);
	});
	it('indexes grid and user sheet selectors', async () => {
		if (name !== 'sqlite') return;
		for (const selector of [
			{ posUserId: '7', posStoreId: '2' },
			{
				posUserId: '7',
				posStoreId: '2',
				status: 'completed',
				dateCreatedGmt: { $gte: '2026-01-01', $lt: '2026-01-02' },
			},
		])
			expect(
				await sqlitePlan(database.orders, {
					selector,
					sort: [{ dateCreatedGmt: 'desc' }, { uuid: 'desc' }],
					limit: 10,
				})
			).not.toEqual(expect.arrayContaining([expect.stringMatching(/^SCAN (?!json_each)/)]));
	});

	beforeEach(async () => {
		database = await createRxDatabase({
			name: `orders-${crypto.randomUUID()}`,
			storage,
			multiInstance: false,
		});
		await database.addCollections({
			orders: engineSyncCollectionCreators().orders as RxCollectionCreator<Record<string, unknown>>,
		});
		await database.orders.bulkInsert(
			[
				['late', 7, 2, '03', 'pos-open'],
				['early', 7, 2, '01', 'pending'],
				['tied', 7, 2, '01', 'pos-partial'],
				['other-store', 7, 9, '02', 'pos-open'],
				['other-cashier', 8, 2, '01', 'pos-open'],
				['other-both', 8, 9, '01', 'pos-open'],
				['store-less', 7, undefined, '04', 'pos-open'],
				// A server-side writer can leave the identity as an integer; readIdentity accepts it.
				['numeric-meta', 7, 2, '05', 'pos-open'],
				['completed', 7, 2, '01', 'completed'],
			].map(([uuid, cashier, store, day, status]) =>
				engineOrder({
					uuid: String(uuid),
					status: String(status),
					date_created_gmt: `2026-01-${day}T00:00:00`,
					meta_data: [
						{ key: '_pos_user', value: uuid === 'numeric-meta' ? cashier : String(cashier) },
						...(store === undefined
							? []
							: [{ key: '_pos_store', value: uuid === 'numeric-meta' ? store : String(store) }]),
					],
				})
			)
		);
	});
	afterEach(async () => {
		await database.close();
	});
	describe('revision sharing', () => {
		let doc: EngineRecord<'orders'>;
		let handle: ReturnType<typeof acquireOpenOrdersQueryHandle>;
		let release: () => void;
		const scope = { cashierId: 9, storeId: 2 };
		const order = (uuid: string) =>
			engineOrder({
				uuid,
				status: 'pos-open',
				line_items: [{ id: 1, product_id: 1, quantity: 1 }],
				meta_data: [
					{ key: '_pos_user', value: '9' },
					{ key: '_pos_store', value: '2' },
				],
			});
		beforeEach(async () => {
			doc = await database.orders.insert(order('order-a'));
			handle = acquireOpenOrdersQueryHandle(createFakeEngine(database), 'revisions', scope);
			release = handle.retain();
			await firstValueFrom(queryHandleAnswers$(handle));
		});
		afterEach(async () => {
			release();
			await Promise.resolve();
		});
		async function change(
			modifier: Parameters<EngineRecord<'orders'>['incrementalModify']>[0],
			record = doc
		) {
			const latest = await record.incrementalModify(modifier);
			await firstValueFrom(
				database.orders
					.find({
						selector: openOrdersSelector(scope.cashierId, scope.storeId),
						sort: OPEN_ORDERS_SORT,
					})
					.$.pipe(filter((records) => records.some((item) => item.revision === latest.revision)))
			);
			await new Promise((resolve) => setTimeout(resolve, 0));
			return handle.value.result;
		}
		function dirtyMark(mutationId: string, prior?: { mutationId: string }) {
			const mutation = { mutationId };
			return change((data) => {
				const local = (data.local ?? {}) as { dirty?: boolean; pendingMutationIds?: string[] };
				const pending = (
					Array.isArray(local.pendingMutationIds) ? local.pendingMutationIds : []
				).filter((id) => id !== prior?.mutationId);
				return {
					...data,
					local: { ...local, dirty: true, pendingMutationIds: [...pending, mutation.mutationId] },
				};
			});
		}
		it('a dirty-mark-only revision keeps the result and the record instance', async () => {
			const before = handle.value.result;
			const after = await dirtyMark('mark-1');
			expect(after).toBe(before);
			expect(after.hits[0].record).toBe(before.hits[0].record);
		});
		it('a bookkeeping-only ack keeps the result', async () => {
			await dirtyMark('mark-1');
			const before = handle.value.result;
			const after = await change((data) => ({
				...data,
				local: { ...data.local, pendingMutationIds: [], dirty: false },
			}));
			expect(after).toBe(before);
		});
		it('a sync-stamped ack publishes a new result', async () => {
			await dirtyMark('mark-1');
			const before = handle.value.result;
			const after = await change((data) => ({
				...data,
				sync: { ...data.sync, revision: 'r-next' },
				local: { ...data.local, pendingMutationIds: [], dirty: false },
			}));
			expect(after).not.toBe(before);
			expect(after.hits[0].record).not.toBe(before.hits[0].record);
		});
		it('a payload change publishes a new result and a new record', async () => {
			const before = handle.value.result;
			const after = await change((data) => {
				data.payload.line_items![0].quantity = 2;
				return data;
			});
			expect(after).not.toBe(before);
			expect(after.hits[0].record).not.toBe(before.hits[0].record);
			expect(after.hits[0].record.getLatest().payload.line_items[0].quantity).toBe(2);
		});
		it("a second order's payload change keeps the unchanged order's hit", async () => {
			const next = firstValueFrom(
				queryHandleAnswers$(handle).pipe(filter((result) => result.count === 2))
			);
			const second = await database.orders.insert(order('order-b'));
			const before = await next;
			const after = await change((data) => {
				data.payload.line_items![0].quantity = 2;
				return data;
			}, second);
			expect(after).not.toBe(before);
			expect(after.hits[0]).toBe(before.hits[0]);
			expect(after.hits[1]).not.toBe(before.hits[1]);
		});
		it('a write through a kept instance after two dirty marks lands', async () => {
			const kept = handle.value.result.hits[0].record as EngineRecord<'orders'>;
			await dirtyMark('mark-1');
			await dirtyMark('mark-2');
			expect(handle.value.result.hits[0].record).toBe(kept);
			await change((data) => {
				data.payload.line_items![0].quantity = 3;
				return data;
			}, kept);
			const latest = await database.orders.findOne(kept.uuid).exec();
			expect(latest.payload.line_items[0].quantity).toBe(3);
			expect(latest.local.pendingMutationIds).toEqual(['mark-1', 'mark-2']);
		});
	});
	it('shares a retained identity key and keeps cashier, store and register keys separate', async () => {
		const engine = createFakeEngine(database);
		const acquire = (scope: OpenOrdersScope) =>
			acquireOpenOrdersQueryHandle(
				engine,
				canonicalQueryKey([
					'open-orders',
					'scope',
					scope.cashierId,
					scope.storeId,
					scope.registerId,
				]),
				scope
			);
		const scope = { cashierId: 7, storeId: 2, registerId: 'register-a' };
		const first = acquire(scope);
		const release = first.retain();
		try {
			expect(acquire({ ...scope })).toBe(first);
			const handles = [
				first,
				acquire({ ...scope, cashierId: 8 }),
				acquire({ ...scope, storeId: 9 }),
				acquire({ ...scope, registerId: 'register-b' }),
			];
			expect(new Set(handles).size).toBe(4);
			expect(new Set(handles.map((handle) => handle.key)).size).toBe(4);
		} finally {
			release();
			await Promise.resolve();
		}
	});
	it('reads scoped creation-ordered rows and declares each open status without a wire limit', async () => {
		const engine = createFakeEngine(database);
		const find = jest.spyOn(database.orders, 'find');
		const handle = acquireOpenOrdersQueryHandle(engine, 'open-orders:7:2', {
			cashierId: 7,
			storeId: 2,
		});
		const release = handle.retain();
		try {
			const result = await firstValueFrom(queryHandleAnswers$(handle));
			expect(result.hits.map((hit) => hit.id)).toEqual(['early', 'tied', 'late', 'numeric-meta']);
			expect(find).toHaveBeenCalledWith({
				selector: {
					status: { $in: ['pos-open', 'pos-partial', 'pending'] },
					posUserId: '7',
					posStoreId: '2',
				},
				sort: [{ dateCreatedGmt: 'asc' }, { uuid: 'asc' }],
			});
			expect(engine.requireCalls).toEqual(
				['pos-open', 'pos-partial', 'pending'].map((status) => ({
					id: expect.stringMatching(new RegExp(`^pos:open-orders:qh\\d+:${status}:orders-browse$`)),
					collection: 'orders',
					kind: 'orders-browse',
					status,
				}))
			);
		} finally {
			release();
			await Promise.resolve();
			find.mockRestore();
		}
	});
	it('requires a matching register entry when bound', async () => {
		await database.orders.bulkInsert(
			['register-a', 'register-b'].map((registerId) =>
				engineOrder({
					uuid: registerId,
					status: 'pos-open',
					meta_data: [
						{ key: '_pos_user', value: '7' },
						{ key: '_pos_store', value: '2' },
						{ key: POS_META_KEYS.register, value: registerId },
					],
				})
			)
		);
		const documents = await database.orders
			.find({ selector: openOrdersSelector(7, 2, 'register-a') })
			.exec();
		expect(documents.map((document) => document.primary)).toEqual(['register-a']);
	});
	it('inOpenOrdersScope agrees with the storage selector over a cashier/store/register matrix', async () => {
		// Orders: cashier 7 or 8 x store 11, 12 or none x register a, b or none.
		const orders = [7, 8].flatMap((cashier) =>
			[11, 12, undefined].flatMap((store) =>
				['register-a', 'register-b', undefined].map((register) => ({
					uuid: `m-${cashier}-${store ?? 'none'}-${register ?? 'none'}`,
					meta_data: [
						{ key: '_pos_user', value: String(cashier) },
						...(store === undefined ? [] : [{ key: '_pos_store', value: String(store) }]),
						...(register === undefined ? [] : [{ key: POS_META_KEYS.register, value: register }]),
					],
				}))
			)
		);
		await database.orders.bulkInsert(
			orders.map((order) => engineOrder({ ...order, status: 'pos-open' }))
		);
		// Not vacuous: a bound store-11 till sees exactly its own order.
		expect(
			orders
				.filter(({ meta_data }) => inOpenOrdersScope(meta_data, 7, 11, 'register-a'))
				.map(({ uuid }) => uuid)
		).toEqual(['m-7-11-register-a']);
		for (const cashier of [7, 8])
			for (const store of [11, NO_STORE, undefined])
				for (const register of ['register-a', 'register-b', null, '']) {
					const matched = await database.orders
						.find({ selector: openOrdersSelector(cashier, store, register) })
						.exec();
					const fromStorage = matched
						.map((document) => String(document.primary))
						.filter((uuid) => uuid.startsWith('m-'))
						.sort();
					const fromPredicate = orders
						.filter(({ meta_data }) => inOpenOrdersScope(meta_data, cashier, store, register))
						.map(({ uuid }) => uuid)
						.sort();
					expect({ cashier, store, register, uuids: fromPredicate }).toEqual({
						cashier,
						store,
						register,
						uuids: fromStorage,
					});
				}
	});
	it.each([
		[2, ['early', 'tied', 'late', 'numeric-meta']],
		[NO_STORE, ['early', 'tied', 'other-store', 'late', 'store-less', 'numeric-meta']],
		[undefined, ['early', 'tied', 'other-store', 'late', 'store-less', 'numeric-meta']],
	])('scopes cashier and store %s and sorts in storage', async (store, expected) => {
		const documents = await database.orders
			.find({
				selector: openOrdersSelector(7, store),
				sort: OPEN_ORDERS_SORT,
			})
			.exec();
		expect(documents.map((document) => document.primary)).toEqual(expected);
		if (name === 'sqlite')
			expect(
				await sqlitePlan(database.orders, {
					selector: openOrdersSelector(7, store),
					sort: OPEN_ORDERS_SORT,
				})
			).not.toEqual(expect.arrayContaining([expect.stringMatching(/^SCAN (?!json_each)/)]));
	});
});
