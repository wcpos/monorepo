import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { engineCollection, observeEngineCollection } from '../../src/records/engine-collection';

function fakeCollection(name: string) {
	return { name, find: () => ({ $: undefined, exec: async () => [] }) };
}

describe('engineCollection', () => {
	it('returns null for a missing database', () => {
		expect(engineCollection(null, 'orders')).toBeNull();
		expect(engineCollection(undefined, 'orders')).toBeNull();
	});

	it('returns null while the engine has not opened the collection', () => {
		expect(engineCollection({ collections: {} }, 'orders')).toBeNull();
		expect(engineCollection({}, 'orders')).toBeNull();
	});

	it('resolves the collection by its engine name, identity-preserved', () => {
		const orders = fakeCollection('orders');
		const database = { collections: { orders, products: fakeCollection('products') } };
		expect(engineCollection(database, 'orders')).toBe(orders);
		expect(engineCollection(database, 'products')).toBe(database.collections.products);
		expect(engineCollection(database, 'variations')).toBeNull();
	});
});

describe('observeEngineCollection', () => {
	function fakeEngine(initialDatabase: unknown) {
		let callback: ((database: unknown) => void) | undefined;
		const engine = {
			active: () => (initialDatabase ? { database: initialDatabase } : null),
			db$: (cb: (database: unknown) => void) => {
				callback = cb;
				return () => {
					callback = undefined;
				};
			},
			ready: new Promise(() => {}),
		} as unknown as RxdbSyncEngine;
		return { engine, emit: (database: unknown) => callback?.(database) };
	}

	it('re-resolves the collection on every db$ emission (scope moves rebind)', () => {
		const firstOrders = fakeCollection('orders');
		const secondOrders = fakeCollection('orders');
		const { engine, emit } = fakeEngine({ collections: { orders: firstOrders } });

		const seen: unknown[] = [];
		const subscription = observeEngineCollection(engine, 'orders').subscribe((collection) =>
			seen.push(collection)
		);

		emit({ collections: { orders: secondOrders } });
		emit(null);
		subscription.unsubscribe();

		expect(seen).toEqual([firstOrders, secondOrders, null]);
	});
});
