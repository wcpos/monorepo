/**
 * @jest-environment jsdom
 *
 * Every screen that reads a binding does it the same way — `const binding = useCollectionBinding(…)`
 * and `useObservableSuspense(binding.resource)` in the SAME component, with no boundary in
 * between: `category-select`, `tag-select`, `brand-select`, `customer-select`, `add-coupon`,
 * `tax-rates`, the reports context, the tax-rates provider.
 *
 * That is the Orders blank-body shape (#1707). `ObservableResource` subscribes in its
 * constructor and `read()` throws a FRESH promise until the first value lands, so a resource
 * held in `useState` only survives while the component that built it commits. A component that
 * suspends before its subtree has ever committed makes React unwind to the boundary and throw
 * the work-in-progress fibers away — hook state included — so the retry builds another resource
 * that suspends for exactly the reason its predecessor did. An engine query's first emission is
 * always async (the `db$` that opens the collection at all, then `find().$`), so the wait never
 * ends on its own.
 *
 * Kept out of `query-bindings.test.tsx` because that file reads `resource.valueRef$$` directly
 * from `renderHook` — nothing in it ever suspends, which is why this went uncaught.
 */

import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

import * as React from 'react';

import { cleanup, render, screen } from '@testing-library/react';
import { useObservableSuspense } from 'observable-hooks';

import { QueryProvider } from '@wcpos/query';
import { createEngineDatabase, createFakeEngine, engineProduct } from '@wcpos/query/testing';
import type { FakeEngine } from '@wcpos/query/testing';
import type { QueryResult } from '@wcpos/query';

import { useCollectionBinding } from './query-bindings';
import { createStoreDatabase } from '../../../query/tests/helpers/db';

import type { QueryStateOf } from './query-state-types';
import type { RxCollection, RxDatabase } from 'rxdb';

Object.assign(globalThis, { TextDecoder, TextEncoder });
Object.defineProperty(globalThis, 'crypto', {
	configurable: true,
	value: webcrypto,
});

const STATE: QueryStateOf<'products'> = {
	search: '',
	filters: { categories: [], tags: [], brands: [] },
	sort: { field: 'id', direction: 'asc' },
	limit: 10,
};

/** Lets every pending microtask (and the React retry it schedules) run. */
async function settle(cycles = 25) {
	for (let i = 0; i < cycles; i++) {
		await React.act(async () => {
			await Promise.resolve();
		});
	}
}

describe('a binding consumed by the component that built it', () => {
	let localDB: RxDatabase;
	let engineDB: RxDatabase;
	let engine: FakeEngine;
	let renders = 0;

	beforeEach(async () => {
		renders = 0;
		localDB = await createStoreDatabase();
		engineDB = await createEngineDatabase(['products']);
		const products = engineDB.collections.products as RxCollection;
		(products as unknown as { initSearch: () => Promise<unknown> }).initSearch = async () => ({
			collection: products,
			find: async () => [],
		});
		engine = createFakeEngine(engineDB);
		await products.bulkInsert([engineProduct({ uuid: 'coffee', id: 1, name: 'Coffee' })]);
	});

	afterEach(async () => {
		cleanup();
		if (localDB && !localDB.destroyed) await localDB.remove();
		if (engineDB && !engineDB.destroyed) await engineDB.remove();
	});

	/** The shape every select/table in the app uses: build and suspend in one component. */
	function Grid() {
		renders++;
		const binding = useCollectionBinding('products', STATE);
		const result = useObservableSuspense(binding.resource) as QueryResult<RxCollection>;
		return <div data-testid="grid">{result.hits.length}</div>;
	}

	function renderGrid() {
		return render(
			<QueryProvider localDB={localDB} engine={engine} locale="en">
				{/* Stands in for expo-router's per-route boundary, whose PRODUCTION fallback is
				    `null` — which is how a never-ending retry showed up as a blank screen. */}
				<React.Suspense fallback={<div data-testid="route-fallback" />}>
					<Grid />
				</React.Suspense>
			</QueryProvider>
		);
	}

	it('mounts on the first emission instead of rebuilding its resource forever', async () => {
		renderGrid();
		await settle();

		expect((await screen.findByTestId('grid')).textContent).toBe('1');
		expect(screen.queryByTestId('route-fallback')).toBeNull();
	});

	it('renders a bounded number of times getting there', async () => {
		// The loop is only visible as a COUNT. Measured in the app, FilterBar renders and
		// resource constructions ran 1:1 on every navigation to Orders; on CI the same loop
		// ran 7,746 times in ~100 s, ~11 ms apart, and the screen never mounted. A handful of
		// attempts is a load; dozens is the loop coming back.
		renderGrid();
		await settle();

		expect(await screen.findByTestId('grid')).toBeTruthy();
		expect(renders).toBeLessThan(10);
	});

	it('keeps serving the same resource across the retries', async () => {
		// THE assertion for this file, and the one that fails on the old code (3 attempts, 3
		// resources — the 1:1 ratio measured in the app). The other two tests here pass either
		// way, because this harness gets LUCKY: the fake engine's `db$` resolves after the
		// first attempt and emits synchronously thereafter, so the third attempt happens to
		// find its value already in. That is precisely how the Orders bar behaved in the app —
		// "the loop was running on every navigation and only ever ended by luck" (#1707) —
		// and it is why a ratio, not a mount, is the instrument. Against a live RxDB
		// collection, whose first emission is always async, there is no luck to be had.
		//
		// The mechanism, stated positively: the retry has to read back the resource the first
		// attempt already subscribed, because THAT one's first emission has already cleared
		// the suspender. A fresh resource per attempt is the bug.
		const resources: unknown[] = [];
		function Probe() {
			const binding = useCollectionBinding('products', STATE);
			resources.push(binding.resource);
			useObservableSuspense(binding.resource);
			return <div data-testid="probe" />;
		}
		render(
			<QueryProvider localDB={localDB} engine={engine} locale="en">
				<React.Suspense fallback={<div data-testid="route-fallback" />}>
					<Probe />
				</React.Suspense>
			</QueryProvider>
		);
		await settle();

		expect(await screen.findByTestId('probe')).toBeTruthy();
		// More than one attempt happened...
		expect(resources.length).toBeGreaterThan(1);
		// ...and all of them read the same resource.
		expect(new Set(resources).size).toBe(1);
	});
});
