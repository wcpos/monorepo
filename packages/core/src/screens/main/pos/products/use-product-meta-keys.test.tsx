/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject } from 'rxjs';

import { useProductMetaKeys } from './use-product-meta-keys';

type FakeDatabase = {
	collections: {
		products: {
			find: jest.Mock;
		};
	};
};

let activeDatabase: FakeDatabase | null;
const databaseSubscribers = new Set<(database: FakeDatabase | null) => void>();

const engine = {
	db$: (subscriber: (database: FakeDatabase | null) => void) => {
		databaseSubscribers.add(subscriber);
		subscriber(activeDatabase);
		return () => databaseSubscribers.delete(subscriber);
	},
};
const manager = { engine };

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => manager,
}));

jest.mock('../../hooks/use-collection', () => ({
	useCollection: () => {
		throw new Error('legacy storeDB read');
	},
}));

function databaseWith<T>(products$: BehaviorSubject<T[]>): FakeDatabase {
	return {
		collections: {
			products: {
				find: jest.fn(() => ({ $: products$.asObservable() })),
			},
		},
	};
}

function emitDatabase(database: FakeDatabase) {
	activeDatabase = database;
	for (const subscriber of databaseSubscribers) subscriber(database);
}

describe('useProductMetaKeys engine scan', () => {
	beforeEach(() => {
		activeDatabase = null;
		databaseSubscribers.clear();
	});

	it('discovers payload meta keys reactively and rebinds after an engine database replacement', () => {
		const firstProducts$ = new BehaviorSubject([
			{ id: 'p1', payload: { meta_data: [{ key: '_size' }, { key: 'engraving' }] } },
			{ id: 'p2', payload: { meta_data: [{ key: 'engraving' }] } },
		]);
		const firstDatabase = databaseWith(firstProducts$);
		activeDatabase = firstDatabase;
		const { result } = renderHook(() => useProductMetaKeys());

		expect(result.current).toEqual(['_size', 'engraving']);
		expect(firstDatabase.collections.products.find).toHaveBeenCalledWith();

		act(() => {
			firstProducts$.next([{ id: 'p1', payload: { meta_data: [{ key: 'material' }] } }]);
		});
		expect(result.current).toEqual(['material']);

		const secondProducts$ = new BehaviorSubject([
			{ id: 'p3', payload: { meta_data: [{ key: 'origin' }] } },
		]);
		act(() => emitDatabase(databaseWith(secondProducts$)));
		expect(result.current).toEqual(['origin']);
	});
});
