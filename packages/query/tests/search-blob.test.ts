import { fillWithDefaultSettings } from 'rxdb';
import { firstValueFrom, skip, Subject } from 'rxjs';

import { searchTerms } from '@wcpos/sync-core';
import {
	SEARCH_FIXTURE_PRODUCTS,
	SEARCH_FIXTURE_TRAPS,
	searchFixtureExpectedIds,
} from '@wcpos/sync-core/testing';
import { engineSyncCollectionCreators } from '@wcpos/sync-engine/testing';

import { searchBlobFor } from '../src/search-blob';

import type { EngineRxDocument } from '../src/engine-adapter/execute-query';
import type { RxChangeEvent } from 'rxdb';

const fields = ['name', 'sku', 'barcode'];
const PRODUCT_SCHEMA = fillWithDefaultSettings(engineSyncCollectionCreators().products.schema);
const snapshot = (document: EngineRxDocument) => document.toJSON();
/** An engine-shaped row as the projection read returns it (the blob never sees an RxDocument). */
const document = (uuid: string, name: string, sku = '', barcode = '') => ({
	uuid,
	payload: { name, sku, barcode },
	_deleted: false,
});

/**
 * The blob reads through the projection seam (`storageInstance.query`), never `find()`
 * (#2242): the fake exposes only what that seam needs, so a blob that reached for
 * `find` would throw here.
 */
function fakeCollection(documents: Record<string, unknown>[] = []) {
	const query = jest.fn(async () => ({ documents }));
	return {
		$: new Subject<RxChangeEvent<Record<string, unknown>>>(),
		schema: { jsonSchema: PRODUCT_SCHEMA, primaryPath: 'uuid' },
		storageInstance: { query },
		database: {} as never,
		onClose: [] as (() => void)[],
		query,
	};
}

function change(operation: 'INSERT' | 'UPDATE' | 'DELETE', documentId: string, name: string) {
	return { operation, documentId, documentData: { name } } as RxChangeEvent<
		Record<string, unknown>
	>;
}

describe('search blob', () => {
	const queries = [
		...SEARCH_FIXTURE_TRAPS.map(({ name, query }) => [name, query]),
		...['RED-1,', '(banana berry)', 'skoda.', '"k2"'].map((query) => [query, query]),
	];
	it.each(queries)('matches the fixture contract: %s', async (_name, query) => {
		const collection = fakeCollection(
			SEARCH_FIXTURE_PRODUCTS.map((p) => document(String(p.id), p.name, p.sku, p.barcode))
		);
		const blob = searchBlobFor(collection, fields, snapshot, 'products');
		try {
			await blob.ready;
			expect(blob.search(searchTerms(query)).sort()).toEqual(
				searchFixtureExpectedIds(query).map(String).sort()
			);
			expect(blob.search([])).toEqual([]);
		} finally {
			blob.dispose();
		}
	});

	it('applies insert, update and delete events before notifying searches', async () => {
		const collection = fakeCollection();
		const blob = searchBlobFor(collection, fields, snapshot, 'products');
		const results: string[][] = [];
		const subscription = blob.changes$.subscribe(() => results.push(blob.search(['coffee'])));
		await blob.ready;
		expect(results.at(-1)).toEqual([]);
		for (const [operation, name, expected] of [
			['INSERT', 'Coffee', ['one']],
			['UPDATE', 'Tea', []],
			['UPDATE', 'Coffee', ['one']],
			['DELETE', 'Coffee', []],
		] as const) {
			const next = firstValueFrom(blob.changes$.pipe(skip(1)));
			collection.$.next(change(operation, 'one', name));
			await next;
			expect(results.at(-1)).toEqual(expected);
		}
		subscription.unsubscribe();
		blob.dispose();
	});

	it('replays changes received during the initial read over the loaded rows', async () => {
		const collection = fakeCollection();
		let finish!: (documents: Record<string, unknown>[]) => void;
		collection.query.mockReturnValue(
			new Promise((resolve) => {
				finish = (documents) => resolve({ documents });
			})
		);
		const blob = searchBlobFor(collection, fields, snapshot, 'products');
		collection.$.next(change('UPDATE', 'old', 'Tea'));
		collection.$.next(change('DELETE', 'deleted', 'Coffee'));
		collection.$.next(change('INSERT', 'new', 'Coffee'));
		finish([document('old', 'Coffee'), document('deleted', 'Coffee')]);
		await blob.ready;
		expect(blob.search(['coffee'])).toEqual(['new']);
		expect(blob.search(['tea'])).toEqual(['old']);
		blob.dispose();
	});

	it('shares the blob until close, then unsubscribes and creates a fresh one', async () => {
		const collection = fakeCollection([document('one', 'Coffee')]);
		const blob = searchBlobFor(collection, fields, snapshot, 'products');
		await blob.ready;
		expect(searchBlobFor(collection, fields, snapshot, 'products')).toBe(blob);
		expect(collection.query).toHaveBeenCalledTimes(1);
		collection.onClose.forEach((close) => close());
		expect(collection.$.observed).toBe(false);
		expect(blob.search(['coffee'])).toEqual([]);
		const fresh = searchBlobFor(collection, fields, snapshot, 'products');
		expect(fresh).not.toBe(blob);
		await fresh.ready;
		fresh.dispose();
		expect(collection.$.observed).toBe(false);
	});

	it('propagates initial read errors through both readiness and changes', async () => {
		const collection = fakeCollection();
		const error = new Error('storage read failed');
		collection.query.mockRejectedValue(error);
		const blob = searchBlobFor(collection, fields, snapshot, 'products');
		await Promise.all([
			expect(blob.ready).rejects.toBe(error),
			expect(firstValueFrom(blob.changes$)).rejects.toBe(error),
		]);
		blob.dispose();
	});
});
