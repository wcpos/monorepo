/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';

import { useOpenOrdersResource } from './use-open-orders-resource';

type EngineDocument = Record<string, unknown> & {
	id: string;
	payload: Record<string, unknown>;
};

type FakeDatabase = {
	collections: {
		orders: {
			find: jest.Mock;
		};
	};
};

let activeDatabase: FakeDatabase | null;
const databaseSubscribers = new Set<(database: FakeDatabase | null) => void>();
const releaseRequirement = jest.fn();
const requireOrders = jest.fn(() => ({
	ready: Promise.reject(new Error('demand unavailable')),
	release: releaseRequirement,
}));

const engine = {
	db$: (subscriber: (database: FakeDatabase | null) => void) => {
		databaseSubscribers.add(subscriber);
		subscriber(activeDatabase);
		return () => databaseSubscribers.delete(subscriber);
	},
	require: requireOrders,
};
const manager = { engine };

jest.mock('@wcpos/query', () => ({
	useQueryManager: () => manager,
}));

function order(
	uuid: string,
	wooOrderId: number,
	dateCreatedGmt: string,
	cashierId: number,
	storeId: number
) {
	const document: EngineDocument = {
		id: uuid,
		wooOrderId,
		status: 'pos-open',
		dateCreatedGmt,
		payload: {
			id: wooOrderId,
			status: 'pos-open',
			date_created_gmt: dateCreatedGmt,
			meta_data: [
				{ key: '_pos_user', value: String(cashierId) },
				{ key: '_pos_store', value: String(storeId) },
			],
		},
	};
	return {
		...document,
		$: of(document),
		collection: { name: 'orders' },
		getLatest: () => order(uuid, wooOrderId, dateCreatedGmt, cashierId, storeId),
		toJSON: () => document,
	};
}

function databaseWith<T>(orders$: BehaviorSubject<T[]>): FakeDatabase {
	return {
		collections: {
			orders: {
				find: jest.fn(() => ({ $: orders$.asObservable() })),
			},
		},
	};
}

function emitDatabase(database: FakeDatabase) {
	activeDatabase = database;
	for (const subscriber of databaseSubscribers) subscriber(database);
}

describe('useOpenOrdersResource', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		activeDatabase = null;
		databaseSubscribers.clear();
	});

	it('reactively filters pos-open orders by cashier/store, sorts, proxies, and rebinds scopes', () => {
		const orders$ = new BehaviorSubject([
			order('late', 3, '2026-07-14T12:00:00', 7, 2),
			order('wrong-store', 4, '2026-07-14T09:00:00', 7, 9),
			order('early', 2, '2026-07-14T10:00:00', 7, 2),
			order('wrong-cashier', 5, '2026-07-14T08:00:00', 8, 2),
		]);
		const firstDatabase = databaseWith(orders$);
		activeDatabase = firstDatabase;
		const { result } = renderHook(() => useOpenOrdersResource(7, 2));

		expect(firstDatabase.collections.orders.find).toHaveBeenCalledWith({
			selector: { status: 'pos-open' },
		});
		type Hit = { id: string; document: { id?: number } };
		expect(result.current.read().map((hit: Hit) => [hit.id, hit.document.id])).toEqual([
			['early', 2],
			['late', 3],
		]);

		act(() => {
			orders$.next([...orders$.value, order('new', 6, '2026-07-14T13:00:00', 7, 2)]);
		});
		expect(result.current.read().map((hit: Hit) => hit.id)).toEqual(['early', 'late', 'new']);

		const nextOrders$ = new BehaviorSubject([order('next-scope', 10, '2026-07-14T14:00:00', 7, 2)]);
		act(() => emitDatabase(databaseWith(nextOrders$)));
		expect(result.current.read().map((hit: Hit) => hit.id)).toEqual(['next-scope']);
	});

	it('holds pos-open order demand for its lifetime without coupling demand failures to residents', async () => {
		const orders$ = new BehaviorSubject([order('resident', 2, '2026-07-14T10:00:00', 7, 2)]);
		activeDatabase = databaseWith(orders$);

		const { result, unmount } = renderHook(() => useOpenOrdersResource(7, 2));

		expect(requireOrders).toHaveBeenCalledWith({
			id: 'pos:open-orders:orders-query',
			collection: 'orders',
			kind: 'query',
			queryKey: 'orders:browser:status=pos-open:search=:limit=10',
		});

		await act(async () => {
			await Promise.resolve();
		});
		expect(result.current.read().map((hit) => hit.id)).toEqual(['resident']);

		unmount();
		expect(releaseRequirement).toHaveBeenCalledTimes(1);
	});

	it('releases its engine database subscriber across repeated mounts', () => {
		for (let mount = 0; mount < 2; mount += 1) {
			const { unmount } = renderHook(() => useOpenOrdersResource(7, 2));
			expect(databaseSubscribers.size).toBe(1);

			unmount();
			expect(databaseSubscribers.size).toBe(0);
		}
	});

	it('resolves to no resident open orders when the engine database is unavailable', () => {
		const { result } = renderHook(() => useOpenOrdersResource(7, 2));

		expect(result.current.read()).toEqual([]);
	});
});
