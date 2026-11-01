import { firstValueFrom } from 'rxjs';

import { NO_STORE } from '@wcpos/sync-core';

import { translateSelector } from '../src/engine-adapter/translate-selector';
import { OPEN_ORDER_STATUSES, openOrdersSelector } from '../src/open-orders-scope';
import { observeOpenCartCount } from '../src/reads/open-cart-count';
import { createEngineDatabase, createFakeEngine, engineOrder } from '../src/testing';

import type { RxDatabase } from 'rxdb';

jest.mock('../src/engine-query', () => ({
	...jest.requireActual('../src/engine-query'),
	observeEngineQuery: jest.fn(jest.requireActual('../src/engine-query').observeEngineQuery),
}));

const { observeEngineQuery } = jest.requireMock('../src/engine-query') as {
	observeEngineQuery: jest.Mock;
};

let database: RxDatabase;
const order = (uuid: string, status: string, user: string, store: string, register?: string) =>
	engineOrder({
		uuid,
		status,
		meta_data: [
			{ key: '_pos_user', value: user },
			{ key: '_pos_store', value: store },
			...(register ? [{ key: '_wcpos_register', value: register }] : []),
		],
	});
beforeEach(async () => {
	database = await createEngineDatabase(['orders']);
	observeEngineQuery.mockClear();
});
afterEach(async () => {
	await database.close();
});

const compiledScope = async (scope: Parameters<typeof observeOpenCartCount>[1]) => {
	await firstValueFrom(observeOpenCartCount(createFakeEngine(database), scope));
	const descriptor = observeEngineQuery.mock.calls[0][1] as {
		collection: 'orders';
		selector: Record<string, unknown>;
	};
	return translateSelector(descriptor.collection, descriptor.selector).prefilter;
};

it.each([
	['a store and a bound register', { cashierId: 8, storeId: 2, registerId: 'A' }],
	['no store attribution', { cashierId: 8, storeId: NO_STORE, registerId: 'A' }],
	['no register bound', { cashierId: 8, storeId: 2, registerId: null }],
])('compiles to the open-orders scope with %s', async (_name, scope) => {
	expect(await compiledScope(scope)).toEqual(
		openOrdersSelector(scope.cashierId, scope.storeId, scope.registerId)
	);
});

it('scopes by open status and cashier, omits the store for NO_STORE, and the register only when bound', async () => {
	const bound = (await compiledScope({
		cashierId: 8,
		storeId: NO_STORE,
		registerId: 'A',
	})) as Record<string, unknown>;
	expect(bound.status).toEqual({ $in: [...OPEN_ORDER_STATUSES] });
	expect(bound.posUserId).toBe('8');
	expect(bound).not.toHaveProperty('posStoreId');
	expect(JSON.stringify(bound['payload.meta_data'])).toContain('_wcpos_register');
	observeEngineQuery.mockClear();
	const unbound = (await compiledScope({ cashierId: 8, storeId: 2 })) as Record<string, unknown>;
	expect(unbound.posStoreId).toBe('2');
	expect(unbound).not.toHaveProperty('payload.meta_data');
});

it("counts only that cashier's open carts on this store and register", async () => {
	await database.collections.orders.bulkInsert([
		order('open', 'pos-open', '8', '2', 'A'),
		order('partial', 'pos-partial', '8', '2', 'A'),
		order('completed', 'completed', '8', '2', 'A'),
		order('other-register', 'pos-open', '8', '2', 'B'),
		order('other-store', 'pos-open', '8', '3', 'A'),
		order('other-cashier', 'pos-open', '7', '2', 'A'),
	]);
	const count = (scope: Parameters<typeof observeOpenCartCount>[1]) =>
		firstValueFrom(observeOpenCartCount(createFakeEngine(database), scope));
	expect(await count({ cashierId: 8, storeId: 2, registerId: 'A' })).toBe(2);
	expect(await count({ cashierId: 8, storeId: 2, registerId: null })).toBe(3);
	expect(await count({ cashierId: 9, storeId: 2, registerId: 'A' })).toBe(0);
});
