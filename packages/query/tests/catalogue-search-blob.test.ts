import { firstValueFrom, skip, Subject } from 'rxjs';

import {
	SEARCH_FIXTURE_PRODUCTS,
	SEARCH_FIXTURE_TRAPS,
	searchFixtureExpectedIds,
} from '@wcpos/sync-core/testing';

import { catalogueSearchBlobFor } from '../src/catalogue-search-blob';
import { searchTerms } from '../src/search-match';

import type { EngineRxDocument } from '../src/engine-adapter/execute-query';
import type { RxChangeEvent } from 'rxdb';

const fields = ['name', 'sku', 'barcode'];
const snapshot = (document: EngineRxDocument) => document.toJSON();
const document = (id: string, name: string, sku = '', barcode = '') =>
	({ primary: id, toJSON: () => ({ name, sku, barcode }) }) as EngineRxDocument;

function fakeCollection(documents: EngineRxDocument[] = []) {
	return {
		$: new Subject<RxChangeEvent<Record<string, unknown>>>(),
		find: jest.fn(() => ({ exec: async () => documents })),
		onClose: [] as (() => void)[],
	};
}

function change(operation: 'INSERT' | 'UPDATE' | 'DELETE', documentId: string, name: string) {
	return { operation, documentId, documentData: { name } } as RxChangeEvent<
		Record<string, unknown>
	>;
}

describe('catalogue search blob', () => {
	const queries = [
		...SEARCH_FIXTURE_TRAPS.map(({ name, query }) => [name, query]),
		...['RED-1,', '(banana berry)', 'skoda.', '"k2"'].map((query) => [query, query]),
	];
	it.each(queries)('matches the fixture contract: %s', async (_name, query) => {
		const collection = fakeCollection(
			SEARCH_FIXTURE_PRODUCTS.map((p) => document(String(p.id), p.name, p.sku, p.barcode))
		);
		const blob = catalogueSearchBlobFor(collection, fields, snapshot);
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
		const blob = catalogueSearchBlobFor(collection, fields, snapshot);
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
		let finish!: (documents: EngineRxDocument[]) => void;
		collection.find.mockReturnValue({
			exec: () =>
				new Promise((resolve) => {
					finish = resolve;
				}),
		});
		const blob = catalogueSearchBlobFor(collection, fields, snapshot);
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
		const blob = catalogueSearchBlobFor(collection, fields, snapshot);
		await blob.ready;
		expect(catalogueSearchBlobFor(collection, fields, snapshot)).toBe(blob);
		expect(collection.find).toHaveBeenCalledTimes(1);
		collection.onClose.forEach((close) => close());
		expect(collection.$.observed).toBe(false);
		expect(blob.search(['coffee'])).toEqual([]);
		const fresh = catalogueSearchBlobFor(collection, fields, snapshot);
		expect(fresh).not.toBe(blob);
		await fresh.ready;
		fresh.dispose();
		expect(collection.$.observed).toBe(false);
	});

	it('propagates initial read errors through both readiness and changes', async () => {
		const collection = fakeCollection();
		const error = new Error('storage read failed');
		collection.find.mockReturnValue({
			exec: async () => {
				throw error;
			},
		});
		const blob = catalogueSearchBlobFor(collection, fields, snapshot);
		await Promise.all([
			expect(blob.ready).rejects.toBe(error),
			expect(firstValueFrom(blob.changes$)).rejects.toBe(error),
		]);
		blob.dispose();
	});
});
