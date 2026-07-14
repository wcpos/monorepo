/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { useEngineDocument, useEngineDocumentByWooId } from './use-engine-document';

import type { RxDocument } from 'rxdb';

type EngineDocument = Record<string, unknown> & {
	id: string;
	payload: Record<string, unknown>;
};

type FakeCollection = {
	findOne: jest.Mock;
};

type FakeDatabase = {
	collections: Record<string, FakeCollection>;
};

let activeDatabase: FakeDatabase | null;
const databaseSubscribers = new Set<(database: FakeDatabase | null) => void>();

const engine = {
	active: () => (activeDatabase ? { database: activeDatabase } : null),
	db$: (subscriber: (database: FakeDatabase | null) => void) => {
		databaseSubscribers.add(subscriber);
		subscriber(activeDatabase);
		return () => databaseSubscribers.delete(subscriber);
	},
};

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => ({ engine }),
}));

function emitDatabase(database: FakeDatabase | null): void {
	activeDatabase = database;
	for (const subscriber of databaseSubscribers) {
		subscriber(database);
	}
}

function fakeRxDocument(initial: EngineDocument) {
	const state = new BehaviorSubject(initial);
	let latest = initial;
	state.subscribe((document) => {
		latest = document;
	});
	const collection = { name: 'products' };
	const makeDocument = (document: EngineDocument): RxDocument<EngineDocument> =>
		({
			...document,
			$: state.asObservable(),
			collection,
			getLatest: () => makeDocument(latest),
			toJSON: () => document,
		}) as unknown as RxDocument<EngineDocument>;
	return { document: makeDocument(initial), state };
}

function databaseWith(document$: BehaviorSubject<RxDocument<EngineDocument> | null>): FakeDatabase {
	return {
		collections: {
			products: {
				findOne: jest.fn(() => ({ $: document$.asObservable() })),
			},
		},
	};
}

function current(resource: ReturnType<typeof useEngineDocument<Record<string, unknown>>>) {
	return resource.valueRef$$.value?.current as Record<string, unknown> | null | undefined;
}

describe('useEngineDocument', () => {
	beforeEach(() => {
		activeDatabase = null;
		databaseSubscribers.clear();
	});

	it('resolves a UUID from the active engine collection and wraps the legacy shape', () => {
		const source = fakeRxDocument({
			id: 'product-uuid',
			wooProductId: 42,
			payload: { name: 'Coffee' },
		});
		const document$ = new BehaviorSubject<RxDocument<EngineDocument> | null>(source.document);
		const database = databaseWith(document$);
		activeDatabase = database;

		const { result } = renderHook(() =>
			useEngineDocument<Record<string, unknown>>('products', 'product-uuid')
		);

		expect(database.collections.products.findOne).toHaveBeenCalledWith('product-uuid');
		const document = current(result.current);
		expect(document?.uuid).toBe('product-uuid');
		expect(document?.id).toBe(42);
		expect(document?.name).toBe('Coffee');
	});

	it('resolves a Woo ID through the collection-specific promoted field', () => {
		const source = fakeRxDocument({
			id: 'product-uuid',
			wooProductId: 42,
			payload: { name: 'Coffee' },
		});
		const document$ = new BehaviorSubject<RxDocument<EngineDocument> | null>(source.document);
		const database = databaseWith(document$);
		activeDatabase = database;

		const { result } = renderHook(() =>
			useEngineDocumentByWooId<Record<string, unknown>>('products', 42)
		);

		expect(database.collections.products.findOne).toHaveBeenCalledWith({
			selector: { wooProductId: 42 },
		});
		const document = current(result.current);
		expect(document?.uuid).toBe('product-uuid');
		expect(document?.id).toBe(42);
	});

	it('emits null when the record is not found', () => {
		const document$ = new BehaviorSubject<RxDocument<EngineDocument> | null>(null);
		activeDatabase = databaseWith(document$);

		const { result } = renderHook(() =>
			useEngineDocument<Record<string, unknown>>('products', 'missing-uuid')
		);

		expect(current(result.current)).toBeNull();
	});

	it('stays pending until a database opens, then emits null for a missing record', () => {
		const { result } = renderHook(() =>
			useEngineDocument<Record<string, unknown>>('products', 'product-uuid')
		);

		expect(current(result.current)).toBeUndefined();

		const document$ = new BehaviorSubject<RxDocument<EngineDocument> | null>(null);
		act(() => emitDatabase(databaseWith(document$)));

		expect(current(result.current)).toBeNull();
	});

	it('emits a newly wrapped document when the engine query updates', () => {
		const first = fakeRxDocument({
			id: 'product-uuid',
			wooProductId: 42,
			payload: { name: 'Coffee' },
		});
		const document$ = new BehaviorSubject<RxDocument<EngineDocument> | null>(first.document);
		activeDatabase = databaseWith(document$);
		const { result } = renderHook(() =>
			useEngineDocument<Record<string, unknown>>('products', 'product-uuid')
		);

		const updated = fakeRxDocument({
			id: 'product-uuid',
			wooProductId: 42,
			payload: { name: 'Tea' },
		});
		act(() => document$.next(updated.document));

		expect(current(result.current)?.name).toBe('Tea');
	});

	it('rebinds the query when the engine moves to another scope', () => {
		const first = fakeRxDocument({
			id: 'product-uuid',
			wooProductId: 42,
			payload: { name: 'Old scope' },
		});
		const second = fakeRxDocument({
			id: 'product-uuid',
			wooProductId: 42,
			payload: { name: 'New scope' },
		});
		const firstDatabase = databaseWith(
			new BehaviorSubject<RxDocument<EngineDocument> | null>(first.document)
		);
		const secondDatabase = databaseWith(
			new BehaviorSubject<RxDocument<EngineDocument> | null>(second.document)
		);
		activeDatabase = firstDatabase;
		const { result } = renderHook(() =>
			useEngineDocument<Record<string, unknown>>('products', 'product-uuid')
		);

		act(() => emitDatabase(secondDatabase));

		expect(secondDatabase.collections.products.findOne).toHaveBeenCalledWith('product-uuid');
		expect(current(result.current)?.name).toBe('New scope');
	});
});
