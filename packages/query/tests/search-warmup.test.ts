import { waitFor } from '@testing-library/react';

import { engineCollectionNameFor } from '../src/engine-adapter/collection-map';
import { legacySearchSnapshot } from '../src/engine-adapter/search-snapshot';
import { searchBlobFor } from '../src/search-blob';
import { SEARCH_FIELDS, searchFieldsFor, setSearchMetaKeys } from '../src/search-fields';
import { warmSearchBlobs } from '../src/search-warmup';
import { createEngineDatabase, createFakeEngine } from '../src/testing';

import type { SearchableCollection } from '../src/search-shared';
import type { RxDatabase } from 'rxdb';

/**
 * The warm-up exists so the first keystroke reuses a blob built at bind time. Reuse is
 * the registry finding the SAME instance for the fields the bindings will pass
 * (`searchFieldsFor`), so the storage read runs once — not merely "something was built".
 */
describe('warmSearchBlobs', () => {
	let database: RxDatabase;
	afterEach(async () => {
		setSearchMetaKeys(undefined);
		if (!database.destroyed) await database.remove();
	});

	function collectionOf(name: keyof typeof SEARCH_FIELDS) {
		return database.collections[engineCollectionNameFor(name)] as unknown as SearchableCollection;
	}
	function readsOf(name: keyof typeof SEARCH_FIELDS) {
		return jest.spyOn(collectionOf(name).storageInstance, 'query');
	}
	function blobFor(name: keyof typeof SEARCH_FIELDS) {
		return searchBlobFor(
			collectionOf(name),
			searchFieldsFor(name)!,
			(document) => legacySearchSnapshot(name, document),
			name
		);
	}

	it('warms the till pair at bind, then the secondary tier once the till blobs are ready', async () => {
		database = await createEngineDatabase(['products', 'variations', 'orders', 'customers']);
		const productReads = readsOf('products');
		const customerReads = readsOf('customers');
		const stop = warmSearchBlobs(createFakeEngine(database));
		try {
			await waitFor(() => expect(productReads).toHaveBeenCalledTimes(1));
			await waitFor(() => expect(customerReads).toHaveBeenCalledTimes(1));

			// A later search for the bindings' field list is the warmed instance: no second read.
			const products = blobFor('products');
			const customers = blobFor('customers');
			await Promise.all([products.ready, customers.ready]);
			expect(productReads).toHaveBeenCalledTimes(1);
			expect(customerReads).toHaveBeenCalledTimes(1);
			expect(blobFor('products')).toBe(products);
			expect(blobFor('customers')).toBe(customers);
		} finally {
			stop();
		}
	});

	it('warms with the site-added meta keys, so the keyed binding reuses the warmed blob', async () => {
		setSearchMetaKeys({ customers: ['loyalty_number'] });
		database = await createEngineDatabase(['products', 'variations', 'customers']);
		const customerReads = readsOf('customers');
		const stop = warmSearchBlobs(createFakeEngine(database));
		try {
			await waitFor(() => expect(customerReads).toHaveBeenCalledTimes(1));
			expect(searchFieldsFor('customers')).toContain('meta_data:loyalty_number');
			const customers = blobFor('customers');
			await customers.ready;
			expect(customerReads).toHaveBeenCalledTimes(1);
			expect(blobFor('customers')).toBe(customers);
		} finally {
			stop();
		}
	});

	it('stops warming once disposed, and never warms a database it was not told about', async () => {
		database = await createEngineDatabase(['products', 'variations', 'customers']);
		const customerReads = readsOf('customers');
		const stop = warmSearchBlobs(createFakeEngine(database), { tillHeadStartCapMs: 50 });
		stop();
		await new Promise((resolve) => setTimeout(resolve, 120));
		expect(customerReads).not.toHaveBeenCalled();
	});
});
