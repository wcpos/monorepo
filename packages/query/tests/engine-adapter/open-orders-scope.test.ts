/** @jest-environment node */
import { createRxDatabase } from 'rxdb';

import { NO_STORE } from '@wcpos/sync-core';
import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';

import { OPEN_ORDERS_SORT, openOrdersSelector } from '../../src/open-orders-scope';
import { engineOrder } from '../../src/testing';
import { storages } from '../helpers/storages';

import type { RxDatabase } from 'rxdb';

describe.each(storages)('%s open-orders scope', (_name, storage) => {
	let database: RxDatabase;
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
				['completed', 7, 2, '01', 'completed'],
			].map(([uuid, cashier, store, day, status]) =>
				engineOrder({
					uuid: String(uuid),
					status: String(status),
					date_created_gmt: `2026-01-${day}T00:00:00`,
					meta_data: [
						{ key: '_pos_user', value: String(cashier) },
						...(store === undefined ? [] : [{ key: '_pos_store', value: String(store) }]),
					],
				})
			)
		);
	});
	afterEach(async () => {
		await database.close();
	});
	it.each([
		[2, ['early', 'tied', 'late']],
		[NO_STORE, ['early', 'tied', 'other-store', 'late', 'store-less']],
		[undefined, ['early', 'tied', 'other-store', 'late', 'store-less']],
	])('scopes cashier and store %s and sorts in storage', async (store, expected) => {
		const documents = await database.orders
			.find({
				selector: openOrdersSelector(7, store),
				sort: OPEN_ORDERS_SORT,
			})
			.exec();
		expect(documents.map((document) => document.primary)).toEqual(expected);
	});
});
