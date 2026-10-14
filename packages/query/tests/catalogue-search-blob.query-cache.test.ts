import { catalogueSearchBlobFor } from '../src/catalogue-search-blob';
import { searchTerms } from '../src/search-match';
import { createStoreDatabase, type ProductCollection } from './helpers/db';

import type { RxDatabase } from 'rxdb';

type BlobCollection = Parameters<typeof catalogueSearchBlobFor>[0];

/** The collection's cached full-collection queries: `find` with an empty selector. */
function fullReads(collection: ProductCollection) {
	return [...collection._queryCache._map.values()].filter(
		(query) => query.op === 'find' && Object.keys(query.mangoQuery.selector ?? {}).length === 0
	);
}

describe('catalogue search blob query cache (#2502)', () => {
	let db: RxDatabase;
	let products: ProductCollection;

	beforeEach(async () => {
		db = await createStoreDatabase();
		products = db.collections.products as ProductCollection;
		await products.bulkInsert([
			{ uuid: 'p-1', id: 1, name: 'Hoodie', sku: 'HOOD-1', barcode: '111' },
			{ uuid: 'p-2', id: 2, name: 'Beanie', sku: 'BEAN-2', barcode: '222' },
			{ uuid: 'p-3', id: 3, name: 'Scarf', sku: 'SCARF-3', barcode: '333' },
		]);
	});

	afterEach(async () => {
		if (!db.destroyed) await db.remove();
	});

	it('builds from a read that leaves no cached query behind', async () => {
		const blob = catalogueSearchBlobFor(
			products as unknown as BlobCollection,
			['name', 'sku', 'barcode'],
			(document) => document.toJSON()
		);
		try {
			await blob.ready;
			// Compared as plain mango queries: pretty-printing an RxQuery throws RxDB's DB14.
			expect(fullReads(products).map((query) => query.mangoQuery)).toEqual([]);
			expect(blob.search(searchTerms('beanie'))).toEqual(['p-2']);
		} finally {
			blob.dispose();
		}
	});

	it('keeps the full-collection query a subscriber is holding', async () => {
		const subscribed = products.find();
		const subscription = subscribed.$.subscribe();
		const blob = catalogueSearchBlobFor(
			products as unknown as BlobCollection,
			['name'],
			(document) => document.toJSON()
		);
		try {
			await blob.ready;
			expect(fullReads(products).includes(subscribed)).toBe(true);
			expect(blob.search(searchTerms('scarf'))).toEqual(['p-3']);
		} finally {
			blob.dispose();
			subscription.unsubscribe();
		}
	});
});
