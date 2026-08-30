/**
 * @jest-environment jsdom
 *
 * Where the `Suspense` boundary sits, for a query binding.
 *
 * `useCollectionBinding` holds its `ObservableResource` in `useState`, which is fiber state:
 * when a component suspends before its subtree has ever committed, React unwinds to the
 * boundary and throws the work-in-progress fibers away, so a component that BUILDS the binding
 * and READS it — with the boundary above rather than between — has its resource rebuilt on
 * every retry, and each new resource suspends for exactly the reason its predecessor did. That
 * is the Orders blank body (#1707), and the second test here is that shape, counted.
 *
 * Every screen in this repo therefore puts the boundary BETWEEN: `customers/index.tsx`,
 * `products/products.tsx`, `coupons/index.tsx` and `pos/products/index.tsx` build the binding
 * and render `<Suspense fallback={<DataTableSkeleton …/>}><DataTable resource=… /></Suspense>`,
 * so the creator commits alongside the skeleton and only the reader waits. The first test is
 * that shape, over a real engine.
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

type QueryBindingResource = ReturnType<typeof useCollectionBinding<'products'>>['resource'];

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
	let resources: unknown[] = [];

	beforeEach(async () => {
		renders = 0;
		resources = [];
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

	/** The reader: it only ever receives a resource, exactly like `DataTable` does. */
	function Grid({ resource }: { resource: QueryBindingResource }) {
		renders++;
		const result = useObservableSuspense(resource) as QueryResult<RxCollection>;
		return <div data-testid="grid">{result.hits.length}</div>;
	}

	/** The screen shape: build the binding here, put the boundary between, read below it. */
	function Screen() {
		const binding = useCollectionBinding('products', STATE);
		resources.push(binding.resource);
		return (
			<>
				<div data-testid="screen-chrome" />
				<React.Suspense fallback={<div data-testid="grid-skeleton" />}>
					<Grid resource={binding.resource as QueryBindingResource} />
				</React.Suspense>
			</>
		);
	}

	function renderGrid() {
		return render(
			<QueryProvider localDB={localDB} engine={engine} locale="en">
				{/* Stands in for expo-router's per-route boundary, whose PRODUCTION fallback is
				    `null` — which is how a never-ending retry showed up as a blank screen. */}
				<React.Suspense fallback={<div data-testid="route-fallback" />}>
					<Screen />
				</React.Suspense>
			</QueryProvider>
		);
	}

	it('mounts on the first emission instead of rebuilding its resource forever', async () => {
		renderGrid();
		await settle();

		expect((await screen.findByTestId('grid')).textContent).toBe('1');
		// The creator committed, so the screen around the grid was never replaced, and every
		// attempt read back the SAME resource.
		expect(screen.queryByTestId('route-fallback')).toBeNull();
		expect(screen.getByTestId('screen-chrome')).toBeTruthy();
		expect(new Set(resources).size).toBe(1);
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

	it('rebuilds its resource on every retry when the boundary is ABOVE the creator', async () => {
		// The control, and the reason the screens are shaped the way they are. Same binding,
		// same engine — only the boundary has moved above the component that builds it, which
		// is the shape the Orders filter bar had. Each attempt builds its own resource; on a
		// live RxDB collection, whose first emission is always async, that never terminates.
		// Here the fake engine's `db$` resolves after the first attempt and emits synchronously
		// afterwards, so the loop ends by luck on the third — exactly how the Orders bar
		// behaved in the app ("the loop only ever ended by luck", #1707), which is why the
		// RATIO is the instrument rather than a mount.
		function CreatorAndReader() {
			const binding = useCollectionBinding('products', STATE);
			resources.push(binding.resource);
			useObservableSuspense(binding.resource);
			return <div data-testid="inline" />;
		}
		render(
			<QueryProvider localDB={localDB} engine={engine} locale="en">
				<React.Suspense fallback={<div data-testid="route-fallback" />}>
					<CreatorAndReader />
				</React.Suspense>
			</QueryProvider>
		);
		await settle();

		expect(await screen.findByTestId('inline')).toBeTruthy();
		// One resource per attempt: more than one attempt, and no two the same.
		expect(resources.length).toBeGreaterThan(1);
		expect(new Set(resources).size).toBe(resources.length);
	});
});
