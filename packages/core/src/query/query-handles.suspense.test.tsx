/**
 * @jest-environment jsdom
 *
 * Where the `Suspense` boundary sits, for a query handle.
 *
 * A handle's read starts when its OWNER retains it, from an effect, and an effect runs only once
 * the owner commits. A reader suspends on `handle.whenAnswered()`; if the owner is under the same
 * boundary as the reader, the owner never commits, nothing starts the read, and the boundary's
 * fallback stays for good. That is the Orders blank body (#1707) by another door, and the third
 * test here is that shape.
 *
 * Every screen in this repo therefore puts the boundary BETWEEN: the screen owns the handle and
 * renders `<Suspense fallback={<DataTableSkeleton …/>}><DataTable handle=… /></Suspense>`, so the
 * owner commits alongside the skeleton and only the reader waits. The first two tests are that
 * shape, over a real engine.
 */

import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

import * as React from 'react';

import { cleanup, render, screen } from '@testing-library/react';

import { QueryProvider } from '@wcpos/query';
import { createEngineDatabase, createFakeEngine, engineProduct } from '@wcpos/query/testing';
import type { FakeEngine } from '@wcpos/query/testing';
import type { QueryHandle } from '@wcpos/query';

import { useCollectionQueryHandle, useQuerySnapshot } from './query-handles';
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

describe('where the boundary sits for a query handle', () => {
	let localDB: RxDatabase;
	let engineDB: RxDatabase;
	let engine: FakeEngine;
	let renders = 0;
	let handles: QueryHandle[] = [];

	beforeEach(async () => {
		renders = 0;
		handles = [];
		localDB = await createStoreDatabase();
		engineDB = await createEngineDatabase(['products']);
		const products = engineDB.collections.products as RxCollection;
		engine = createFakeEngine(engineDB);
		await products.bulkInsert([engineProduct({ uuid: 'coffee', id: 1, name: 'Coffee' })]);
	});

	afterEach(async () => {
		cleanup();
		if (localDB && !localDB.destroyed) await localDB.remove();
		if (engineDB && !engineDB.destroyed) await engineDB.remove();
	});

	/** The reader: it only ever receives a handle, exactly like `DataTable` does. */
	function Grid({ handle }: { handle: QueryHandle }) {
		renders++;
		const { result } = useQuerySnapshot(handle);
		return <div data-testid="grid">{result.hits.length}</div>;
	}

	/** The screen shape: own the handle here, put the boundary between, read below it. */
	function Screen() {
		const handle = useCollectionQueryHandle('products', STATE);
		handles.push(handle);
		return (
			<>
				<div data-testid="screen-chrome" />
				<React.Suspense fallback={<div data-testid="grid-skeleton" />}>
					<Grid handle={handle} />
				</React.Suspense>
			</>
		);
	}

	function renderGrid() {
		return render(
			<QueryProvider localDB={localDB} engine={engine} locale="en">
				{/* Stands in for expo-router's per-route boundary, whose PRODUCTION fallback is
				    `null` — which is how a reader that never answers showed up as a blank screen. */}
				<React.Suspense fallback={<div data-testid="route-fallback" />}>
					<Screen />
				</React.Suspense>
			</QueryProvider>
		);
	}

	it('mounts on the first answer, the owner committed and one handle throughout', async () => {
		renderGrid();
		await settle();

		expect((await screen.findByTestId('grid')).textContent).toBe('1');
		// The owner committed, so the screen around the grid was never replaced, and every
		// render handed the reader the SAME handle.
		expect(screen.queryByTestId('route-fallback')).toBeNull();
		expect(screen.getByTestId('screen-chrome')).toBeTruthy();
		expect(new Set(handles).size).toBe(1);
	});

	it('renders a bounded number of times getting there', async () => {
		// A loop is only visible as a COUNT: on CI the #1707 loop ran 7,746 times in ~100 s and
		// the screen never mounted. A handful of renders is a load; dozens is a loop.
		renderGrid();
		await settle();

		expect(await screen.findByTestId('grid')).toBeTruthy();
		expect(renders).toBeLessThan(10);
	});

	it('never answers when the boundary is ABOVE the owner: its retain never commits', async () => {
		// The control, and the reason the screens are shaped the way they are. Same handle hook,
		// same engine — only the boundary has moved above the component that owns the handle. It
		// suspends before its effects run, so nothing retains the handle and nothing starts the
		// read the reader is waiting on.
		function OwnerAndReader() {
			const handle = useCollectionQueryHandle('products', STATE);
			useQuerySnapshot(handle);
			return <div data-testid="inline" />;
		}
		render(
			<QueryProvider localDB={localDB} engine={engine} locale="en">
				<React.Suspense fallback={<div data-testid="route-fallback" />}>
					<OwnerAndReader />
				</React.Suspense>
			</QueryProvider>
		);
		await settle();

		expect(screen.queryByTestId('inline')).toBeNull();
		expect(screen.getByTestId('route-fallback')).toBeTruthy();
		// Nothing declared either: demand is the owner's, and the owner never committed.
		expect(engine.requireCalls).toEqual([]);
	});
});
