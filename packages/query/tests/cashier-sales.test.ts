import { firstValueFrom } from 'rxjs';

import { observeCashierSalesTotal } from '../src/reads/cashier-sales';
import { createEngineDatabase, createFakeEngine, engineOrder } from '../src/testing';

import type { RxDatabase } from 'rxdb';

let database: RxDatabase;
const scope = {
	cashierId: '7',
	storeId: '2',
	fromGmt: '2026-10-19T00:00:00',
	toGmt: '2026-10-20T00:00:00',
};
const order = (uuid: string, total: string, overrides = {}) =>
	engineOrder({
		uuid,
		total,
		status: 'completed',
		date_created_gmt: scope.fromGmt,
		meta_data: [
			{ key: '_pos_user', value: '7' },
			{ key: '_pos_store', value: '2' },
		],
		...overrides,
	});
beforeEach(async () => {
	database = await createEngineDatabase(['orders']);
});
afterEach(async () => {
	await database.close();
});

it('sums 10.10 and 20.20 without floating-point drift', async () => {
	await database.collections.orders.bulkInsert([order('a', '10.10'), order('b', '20.20')]);
	const total = await firstValueFrom(observeCashierSalesTotal(createFakeEngine(database), scope));
	expect(total).toBe(30.3);
	expect(total * 100).toBe(3030);
});

it('returns zero when no completed orders match', async () => {
	expect(await firstValueFrom(observeCashierSalesTotal(createFakeEngine(database), scope))).toBe(0);
});

it('counts only this cashier and store, completed, including the start but excluding the end', async () => {
	await database.collections.orders.bulkInsert([
		order('yes', '10'),
		order('pending', '100', { status: 'pending' }),
		order('yesterday', '100', { date_created_gmt: '2026-10-18T23:59:59' }),
		order('tomorrow', '100', { date_created_gmt: scope.toGmt }),
		order('cashier', '100', {
			meta_data: [
				{ key: '_pos_user', value: '8' },
				{ key: '_pos_store', value: '2' },
			],
		}),
		order('store', '100', {
			meta_data: [
				{ key: '_pos_user', value: '7' },
				{ key: '_pos_store', value: '3' },
			],
		}),
	]);
	expect(await firstValueFrom(observeCashierSalesTotal(createFakeEngine(database), scope))).toBe(
		10
	);
});

it.each([
	['10.4', '20.4', 30.8],
	['10.101', '20.202', 30.303],
	['10.123456', '20.123456', 30.246912],
])('preserves persisted precision when summing %s + %s', async (a, b, expected) => {
	await database.collections.orders.bulkInsert([order('a', String(a)), order('b', String(b))]);
	expect(await firstValueFrom(observeCashierSalesTotal(createFakeEngine(database), scope))).toBe(
		expected
	);
});
