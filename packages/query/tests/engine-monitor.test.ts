import { BehaviorSubject } from 'rxjs';

import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import {
	observeEngineCensus,
	observeEngineCollectionCounts,
	observeEngineMutationCounts,
} from '../src/engine-monitor';

const COLLECTION_NAMES = [
	'orders',
	'products',
	'variations',
	'customers',
	'taxRates',
	'categories',
	'brands',
	'tags',
	'coupons',
] as const;

type FakeDatabase = { collections: Record<string, unknown> };

function swappableEngine(initial: FakeDatabase) {
	let active = initial;
	const subscribers = new Set<(database: FakeDatabase | null) => void>();
	return {
		engine: {
			active: () => ({ database: active }),
			ready: Promise.resolve({ database: active }),
			db$: (cb: (database: FakeDatabase | null) => void) => {
				subscribers.add(cb);
				cb(active);
				return () => subscribers.delete(cb);
			},
		} as unknown as RxdbSyncEngine,
		swap(database: FakeDatabase) {
			active = database;
			for (const subscriber of subscribers) subscriber(database);
		},
	};
}

function countDatabase(offset: number) {
	const counts = Object.fromEntries(
		COLLECTION_NAMES.map((name, index) => [name, new BehaviorSubject(offset + index)])
	) as Record<(typeof COLLECTION_NAMES)[number], BehaviorSubject<number>>;
	return {
		counts,
		database: {
			collections: Object.fromEntries(
				COLLECTION_NAMES.map((name) => [name, { count: () => ({ $: counts[name] }) }])
			),
		},
	};
}

function mutationDatabase(pending: number, conflicts: number) {
	const pending$ = new BehaviorSubject(Array.from({ length: pending }, () => ({})));
	const conflicts$ = new BehaviorSubject(Array.from({ length: conflicts }, () => ({})));
	const find = jest.fn((query: { selector: { status: { $in: string[] } } }) => ({
		$: query.selector.status.$in.includes('rejected') ? conflicts$ : pending$,
	}));
	return {
		pending$,
		conflicts$,
		find,
		database: { collections: { recordMutations: { find } } },
	};
}

describe('engine monitor observers', () => {
	it('forwards census snapshots and unsubscription through the engine facade', () => {
		const subscribers = new Set<(totals: { orders: { total: number } | null }) => void>();
		const engine = {
			censusChanges: (cb: (totals: { orders: { total: number } | null }) => void) => {
				subscribers.add(cb);
				cb({ orders: null });
				return () => subscribers.delete(cb);
			},
		} as unknown as RxdbSyncEngine;
		const emissions: unknown[] = [];
		const unsubscribe = observeEngineCensus(engine, (totals) => emissions.push(totals));

		expect(emissions).toEqual([{ orders: null }]);
		for (const subscriber of subscribers) subscriber({ orders: { total: 12 } });
		expect(emissions.at(-1)).toEqual({ orders: { total: 12 } });

		unsubscribe();
		expect(subscribers.size).toBe(0);
	});

	it('observes every synced collection count and re-subscribes on database swaps', () => {
		const first = countDatabase(1);
		const second = countDatabase(11);
		const { engine, swap } = swappableEngine(first.database);
		const emissions: Record<string, number>[] = [];
		const unsubscribe = observeEngineCollectionCounts(engine, (counts) => emissions.push(counts));

		expect(emissions.at(-1)).toEqual(
			Object.fromEntries(COLLECTION_NAMES.map((name, index) => [name, index + 1]))
		);
		const initial = emissions.at(-1);
		first.counts.products.next(99);
		expect(emissions.at(-1)?.products).toBe(99);
		expect(emissions.at(-1)).not.toBe(initial);

		swap(second.database);
		expect(emissions.at(-1)).toEqual(
			Object.fromEntries(COLLECTION_NAMES.map((name, index) => [name, index + 11]))
		);
		const afterSwap = emissions.length;
		first.counts.products.next(100);
		expect(emissions).toHaveLength(afterSwap);
		second.counts.orders.next(50);
		expect(emissions.at(-1)?.orders).toBe(50);

		unsubscribe();
		second.counts.orders.next(51);
		expect(emissions.at(-1)?.orders).toBe(50);
	});

	it('observes pending and conflict selectors and re-subscribes on database swaps', () => {
		const first = mutationDatabase(2, 1);
		const second = mutationDatabase(4, 3);
		const { engine, swap } = swappableEngine(first.database);
		const emissions: { pending: number; conflicts: number }[] = [];
		const unsubscribe = observeEngineMutationCounts(engine, (counts) => emissions.push(counts));

		expect(first.find).toHaveBeenCalledWith({
			selector: { status: { $in: ['pending', 'claimed', 'conflicted', 'needs-revision'] } },
		});
		expect(first.find).toHaveBeenCalledWith({
			selector: { status: { $in: ['conflicted', 'needs-revision', 'rejected'] } },
		});
		expect(emissions.at(-1)).toEqual({ pending: 2, conflicts: 1 });

		first.pending$.next([{}, {}, {}]);
		expect(emissions.at(-1)).toEqual({ pending: 3, conflicts: 1 });
		swap(second.database);
		expect(emissions.at(-1)).toEqual({ pending: 4, conflicts: 3 });
		const afterSwap = emissions.length;
		first.conflicts$.next([]);
		expect(emissions).toHaveLength(afterSwap);
		second.conflicts$.next([{}]);
		expect(emissions.at(-1)).toEqual({ pending: 4, conflicts: 1 });

		unsubscribe();
		second.pending$.next([]);
		expect(emissions.at(-1)).toEqual({ pending: 4, conflicts: 1 });
	});
});
