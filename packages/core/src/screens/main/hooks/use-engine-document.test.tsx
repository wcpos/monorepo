/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import {
	useEngineRecord,
	useEngineRecordByWooId,
	useEngineRecordsByWooId,
} from './use-engine-document';

import type { RxDocument } from 'rxdb';

type EngineDocument = Record<string, unknown> & {
	uuid: string;
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
	useQueryRuntime: () => ({ engine }),
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

describe('useEngineRecord', () => {
	beforeEach(() => {
		activeDatabase = null;
		engineReady = new Promise(() => undefined);
		databaseSubscribers.clear();
	});

	it('returns an engine record by Woo ID without wrapping its payload', () => {
		const source = fakeRxDocument({
			uuid: 'tag-42',
			remoteId: '42',
			payload: { id: 42, name: 'Featured' },
		});
		const document$ = new BehaviorSubject<RxDocument<EngineDocument> | null>(source.document);
		const findOne = jest.fn(() => ({ $: document$.asObservable() }));
		activeDatabase = databaseWithCollection('tags', findOne);

		const { result } = renderHook(() => useEngineRecordByWooId('tags', 42));

		expect(findOne).toHaveBeenCalledWith({ selector: { remoteId: '42' } });
		const record = result.current.read();
		expect(record).toBe(source.document);
		expect(record?.payload.name).toBe('Featured');
	});

	it('keeps the last UUID record when a replacement database lacks the collection', () => {
		const source = fakeRxDocument({
			uuid: 'product-uuid',
			remoteId: '42',
			payload: { id: 42, name: 'Coffee' },
		});
		const document$ = new BehaviorSubject<RxDocument<EngineDocument> | null>(source.document);
		activeDatabase = databaseWith(document$);

		const { result } = renderHook(() => useEngineRecord('products', 'product-uuid'));
		const emissions: unknown[] = [];
		const subscription = result.current.valueRef$$.subscribe((value) =>
			emissions.push(value?.current)
		);

		act(() => emitDatabase({ collections: {} }));

		expect(result.current.read()).toBe(source.document);
		expect(emissions).toEqual([source.document]);
		expect(() => result.current.read()).not.toThrow();
		subscription.unsubscribe();
	});

	it('resolves null for an invalid Woo ID without querying the collection', () => {
		const findOne = jest.fn();
		activeDatabase = databaseWithCollection('tags', findOne);

		const { result } = renderHook(() => useEngineRecordByWooId('tags', 0));

		expect(findOne).not.toHaveBeenCalled();
		expect(result.current.read()).toBeNull();
	});

	it('returns engine records in requested Woo ID order and leaves missing IDs absent', () => {
		const hardware = fakeRxDocument({
			uuid: 'category-38',
			remoteId: '38',
			payload: { id: 38, name: 'Hardware' },
		});
		const tools = fakeRxDocument({
			uuid: 'category-12',
			remoteId: '12',
			payload: { id: 12, name: 'Tools' },
		});
		const documents$ = new BehaviorSubject<RxDocument<EngineDocument>[]>([
			hardware.document,
			tools.document,
		]);
		const find = jest.fn(() => ({ $: documents$.asObservable() }));
		activeDatabase = databaseWithCollection('categories', jest.fn(), find);

		const { result } = renderHook(() => useEngineRecordsByWooId('categories', [12, 999, 38]));

		expect(find).toHaveBeenCalledWith({ selector: { remoteId: { $in: ['12', '999', '38'] } } });
		expect(result.current.read()).toEqual([tools.document, hardware.document]);
	});

	it('emits null when the record is not found', () => {
		const document$ = new BehaviorSubject<RxDocument<EngineDocument> | null>(null);
		activeDatabase = databaseWith(document$);

		const { result } = renderHook(() => useEngineRecord('products', 'missing-uuid'));

		expect(result.current.read()).toBeNull();
	});

	it('stays pending while the database opens and emits null only after a live query misses', async () => {
		const { result } = renderHook(() => useEngineRecord('products', 'product-uuid'));

		expect(result.current.valueRef$$.value?.current).toBeUndefined();

		const database = databaseWith(new BehaviorSubject<RxDocument<EngineDocument> | null>(null));
		await act(async () => {
			emitDatabase(database);
		});

		expect(database.collections.products.findOne).toHaveBeenCalledWith('product-uuid');
		expect(result.current.read()).toBeNull();
	});

	it('resolves an empty document list while the database opens', () => {
		const { result } = renderHook(() => useEngineRecordsByWooId('categories', [42]));

		expect(result.current.valueRef$$.value?.current).toEqual([]);
	});

	it('emits a new record when the engine query updates', () => {
		const first = fakeRxDocument({
			uuid: 'product-uuid',
			remoteId: '42',
			payload: { name: 'Coffee' },
		});
		const document$ = new BehaviorSubject<RxDocument<EngineDocument> | null>(first.document);
		activeDatabase = databaseWith(document$);
		const { result } = renderHook(() => useEngineRecord('products', 'product-uuid'));

		const updated = fakeRxDocument({
			uuid: 'product-uuid',
			remoteId: '42',
			payload: { name: 'Tea' },
		});
		act(() => document$.next(updated.document));

		expect(result.current.read()?.payload.name).toBe('Tea');
	});

	it('rebinds the query when the engine moves to another scope', () => {
		const first = fakeRxDocument({
			uuid: 'product-uuid',
			remoteId: '42',
			payload: { name: 'Old scope' },
		});
		const second = fakeRxDocument({
			uuid: 'product-uuid',
			remoteId: '42',
			payload: { name: 'New scope' },
		});
		const firstDatabase = databaseWith(
			new BehaviorSubject<RxDocument<EngineDocument> | null>(first.document)
		);
		const secondDatabase = databaseWith(
			new BehaviorSubject<RxDocument<EngineDocument> | null>(second.document)
		);
		activeDatabase = firstDatabase;
		const { result } = renderHook(() => useEngineRecord('products', 'product-uuid'));

		act(() => emitDatabase(secondDatabase));

		expect(secondDatabase.collections.products.findOne).toHaveBeenCalledWith('product-uuid');
		expect(result.current.read()?.payload.name).toBe('New scope');
	});

	it.each([
		['single-record', () => useEngineRecord('products', 'missing')],
		['multi-record', () => useEngineRecordsByWooId('categories', [42])],
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
