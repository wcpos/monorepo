/** @jest-environment node */
import { createRxDatabase } from 'rxdb';

import { NO_STORE, POS_META_KEYS } from '@wcpos/sync-core';
import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';

import { OPEN_ORDERS_SORT, openOrdersSelector } from '../../src/open-orders-scope';
import { engineOrder } from '../../src/testing';
import { sqlitePlan } from '../helpers/sqlite-plan';
import { storages } from '../helpers/storages';

import type { RxDatabase } from 'rxdb';

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
		await database.addCollections({ orders: engineSyncCollectionCreators().orders });
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
