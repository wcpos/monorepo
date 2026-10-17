import { engineCollection } from '../../src/records/engine-collection';

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
