/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import {
	useEngineDocument,
	useEngineDocumentByWooId,
	useEngineDocumentsByWooId,
} from './use-engine-document';

import type { RxDocument } from 'rxdb';

type EngineDocument = Record<string, unknown> & {
	id: string;
	payload: Record<string, unknown>;
};

type FakeCollection = {
	findOne: jest.Mock;
	find?: jest.Mock;
};

type FakeDatabase = {
	collections: Record<string, FakeCollection>;
};

let activeDatabase: FakeDatabase | null;
let engineReady: Promise<{ database: FakeDatabase }>;
let resolveEngineReady: (scope: { database: FakeDatabase }) => void;
const databaseSubscribers = new Set<(database: FakeDatabase | null) => void>();

const engine = {
	active: () => (activeDatabase ? { database: activeDatabase } : null),
	get ready() {
		return engineReady;
	},
	db$: (subscriber: (database: FakeDatabase | null) => void) => {
		databaseSubscribers.add(subscriber);
		subscriber(activeDatabase);
		return () => databaseSubscribers.delete(subscriber);
	},
};

jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
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

function databaseWithCollection(
	collectionName: string,
	findOne: jest.Mock,
	find: jest.Mock = jest.fn()
): FakeDatabase {
	return {
		collections: {
			[collectionName]: { findOne, find },
		},
	};
}

function current(resource: ReturnType<typeof useEngineDocument<Record<string, unknown>>>) {
	return resource.valueRef$$.value?.current as Record<string, unknown> | null | undefined;
}

describe('useEngineDocument', () => {
	beforeEach(() => {
		activeDatabase = null;
		engineReady = new Promise((resolve) => {
			resolveEngineReady = resolve;
		});
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

	it.each([
		['category-pill', 'products/categories', 'categories', 'wooId'],
		['product-filter tag', 'products/tags', 'tags', 'wooId'],
		['product-filter brand', 'products/brands', 'brands', 'wooId'],
		['order-edit customer', 'customers', 'customers', 'wooCustomerId'],
		['edit-cart-customer', 'customers', 'customers', 'wooCustomerId'],
	] as const)(
		'resolves the %s key path through %s by its adapter-mapped Woo ID field',
		(_site, legacyCollection, engineCollection, wooIdField) => {
			const source = fakeRxDocument({
				id: `${engineCollection}-uuid`,
				[wooIdField]: 42,
				payload: { name: 'Selected record' },
			});
			const document$ = new BehaviorSubject<RxDocument<EngineDocument> | null>(source.document);
			const findOne = jest.fn(() => ({ $: document$.asObservable() }));
			activeDatabase = databaseWithCollection(engineCollection, findOne);

			const { result } = renderHook(() =>
				useEngineDocumentByWooId<Record<string, unknown>>(legacyCollection, 42)
			);

			expect(findOne).toHaveBeenCalledWith({ selector: { [wooIdField]: 42 } });
			expect(current(result.current)?.id).toBe(42);
		}
	);

	it('resolves selected categories as an ordered list and leaves missing IDs absent', () => {
		const hardware = fakeRxDocument({
			id: 'category-38',
			wooId: 38,
			payload: { name: 'Hardware' },
		});
		const tools = fakeRxDocument({
			id: 'category-12',
			wooId: 12,
			payload: { name: 'Tools' },
		});
		const documents$ = new BehaviorSubject<RxDocument<EngineDocument>[]>([
			hardware.document,
			tools.document,
		]);
		const find = jest.fn(() => ({ $: documents$.asObservable() }));
		activeDatabase = databaseWithCollection('categories', jest.fn(), find);

		const { result } = renderHook(() =>
			useEngineDocumentsByWooId<Record<string, unknown>>('products/categories', [12, 999, 38])
		);

		expect(find).toHaveBeenCalledWith({ selector: { wooId: { $in: [12, 999, 38] } } });
		expect(result.current.read().map((document: Record<string, unknown>) => document.id)).toEqual([
			12, 38,
		]);
	});

	it('emits null when the record is not found', () => {
		const document$ = new BehaviorSubject<RxDocument<EngineDocument> | null>(null);
		activeDatabase = databaseWith(document$);

		const { result } = renderHook(() =>
			useEngineDocument<Record<string, unknown>>('products', 'missing-uuid')
		);

		expect(current(result.current)).toBeNull();
	});

	it('resolves null while the database opens and uses ready as a live-database backstop', async () => {
		const { result } = renderHook(() =>
			useEngineDocument<Record<string, unknown>>('products', 'product-uuid')
		);

		expect(current(result.current)).toBeNull();

		const source = fakeRxDocument({
			id: 'product-uuid',
			wooProductId: 42,
			payload: { name: 'Coffee' },
		});
		const database = databaseWith(
			new BehaviorSubject<RxDocument<EngineDocument> | null>(source.document)
		);
		await act(async () => {
			activeDatabase = database;
			resolveEngineReady({ database });
			await engineReady;
		});

		expect(current(result.current)?.name).toBe('Coffee');
	});

	it('resolves an empty document list while the database opens', () => {
		const { result } = renderHook(() =>
			useEngineDocumentsByWooId<Record<string, unknown>>('products/categories', [42])
		);

		expect(result.current.valueRef$$.value?.current).toEqual([]);
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

	it.each([
		['single-document', () => useEngineDocument<Record<string, unknown>>('products', 'missing')],
		[
			'multi-document',
			() => useEngineDocumentsByWooId<Record<string, unknown>>('products/categories', [42]),
		],
	] as const)('releases the %s db$ subscriber across repeated mounts', (_name, useResource) => {
		for (let mount = 0; mount < 2; mount += 1) {
			const { unmount } = renderHook(() => {
				useResource();
				return null;
			});
			expect(databaseSubscribers.size).toBe(1);

			unmount();
			expect(databaseSubscribers.size).toBe(0);
		}
	});
});
