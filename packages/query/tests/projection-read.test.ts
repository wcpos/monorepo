/** @jest-environment node */
import { createRxDatabase } from 'rxdb';

import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';

import { catalogueSearchBlobFor } from '../src/catalogue-search-blob';
import { legacySearchSnapshot } from '../src/engine-adapter/search-snapshot';
import { LEGACY_SEARCH_FIELDS, resolveLegacyField } from '../src/engine-adapter/collection-map';
import {
	projectionReaderFor,
	registerProjectionReader,
	storageQueryProjectionReader,
} from '../src/projection-read';
import { engineProduct } from '../src/testing';
import { storages } from './helpers/storages';

import type { RxDatabase } from 'rxdb';

describe.each(storages)('%s projection reads', (_name, storage) => {
	let database: RxDatabase;
	beforeEach(async () => {
		database = await createRxDatabase({
			name: `projection-${crypto.randomUUID()}`,
			storage,
			multiInstance: false,
		});
		await database.addCollections({ products: engineSyncCollectionCreators().products });
		await database.products.bulkInsert([
			engineProduct({ uuid: 'coffee', name: 'Coffee', sku: 'C1' }),
			engineProduct({ uuid: 'tea', name: 'Tea', sku: 'T1' }),
			engineProduct({ uuid: 'deleted', name: 'Gone', sku: 'D1' }),
		]);
		await database.products.bulkRemove(['deleted']);
	});
	afterEach(async () => {
		await database.close();
	});
	it('reads only live ids and requested values without building RxDocuments', async () => {
		const rows = await storageQueryProjectionReader.readLiveProjection(database.products, [
			'payload.name',
			'payload.sku',
		]);
		expect(rows.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
			{ id: 'coffee', values: ['Coffee', 'C1'] },
			{ id: 'tea', values: ['Tea', 'T1'] },
		]);
	});
	it('builds the catalogue index without collection.find', async () => {
		const find = jest.spyOn(database.products, 'find');
		const blob = catalogueSearchBlobFor(
			database.products,
			['name', 'sku'],
			(doc) => legacySearchSnapshot('products', doc),
			'products'
		);
		await blob.ready;
		expect(blob.search(['coffee'])).toEqual(['coffee']);
		expect(find).not.toHaveBeenCalled();
		blob.dispose();
	});
	it('uses the default until a reader is registered for this database', async () => {
		expect(projectionReaderFor(database)).toBe(storageQueryProjectionReader);
		const reader = { readLiveProjection: async () => [{ id: 'custom', values: ['Custom'] }] };
		registerProjectionReader(database, reader);
		expect(projectionReaderFor(database)).toBe(reader);
		const blob = catalogueSearchBlobFor(
			database.products,
			['name'],
			(doc) => legacySearchSnapshot('products', doc),
			'products'
		);
		await blob.ready;
		expect(blob.search(['custom'])).toEqual(['custom']);
		blob.dispose();
	});
});

it('all configured search fields are plain engine paths', () => {
	for (const [collection, fields] of Object.entries(LEGACY_SEARCH_FIELDS)) {
		for (const field of fields) {
			const mapping = resolveLegacyField(collection as keyof typeof LEGACY_SEARCH_FIELDS, field);
			expect(mapping.compute).toBeUndefined();
			expect(mapping.read).toBeUndefined();
			expect(mapping.readEnginePath).toBeUndefined();
		}
	}
});
