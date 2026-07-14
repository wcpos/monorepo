import * as React from 'react';

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';

import { httpClientMock } from './__mocks__/http';
import { createStoreDatabase } from './helpers/db';
import { createEngineDatabase, createPendingFakeEngine, engineProduct } from './helpers/engine';
import { LEGACY_COLLECTION_NAMES } from '../src/engine-adapter/collection-map';
import { QueryProvider } from '../src/provider';
import { useQuery } from '../src/use-query';

import type { PendingFakeEngine } from './helpers/engine';
import type { RxDatabase } from 'rxdb';

// Mock the logger module
jest.mock('@wcpos/utils/src/logger');

/**
 * REGRESSION (query seam swap): the mount hands the provider an engine whose
 * RxDB database opens ASYNCHRONOUSLY. Before it settles, `engine.active()` is
 * `null`, so `getCollection` used to return `undefined` → `registerQuery`
 * returned `undefined` → `useQuery` returned `undefined` → screens reading
 * `query.resource` crashed with "Cannot read properties of undefined (reading
 * 'resource')". The engine's contract is "ready = initial database usable;
 * bootstrap/lane failures are degraded, not fatal", so the query surface must
 * DEGRADE (constructible query, empty results) and then go live.
 */
describe('degrade when the engine is not ready', () => {
	let localDB: RxDatabase;
	let engineDB: RxDatabase;
	let pending: PendingFakeEngine;

	beforeEach(async () => {
		localDB = await createStoreDatabase();
		engineDB = await createEngineDatabase([
			'products',
			'variations',
			'orders',
			'customers',
			'taxRates',
			'categories',
			'tags',
			'brands',
			'coupons',
		]);
		pending = createPendingFakeEngine(engineDB);
	});

	afterEach(async () => {
		if (localDB && !localDB.destroyed) await localDB.remove();
		if (engineDB && !engineDB.destroyed) await engineDB.remove();
		cleanup();
		jest.clearAllMocks();
	});

	function Provider({ children }: { children: React.ReactNode }) {
		return (
			<QueryProvider localDB={localDB} engine={pending.engine} http={httpClientMock} locale="">
				{children}
			</QueryProvider>
		);
	}

	it('useQuery returns a defined query with a working .resource for every mapped collection while active() is null', () => {
		// active() is null (engine not opened) for the whole render.
		expect(pending.engine.active()).toBeNull();

		const captured: Record<string, any> = {};

		function Consumer({ name }: { name: string }) {
			const query = useQuery({ queryKeys: [name, 'degrade'], collectionName: name });
			if (query === undefined) {
				throw new Error(`useQuery returned undefined for "${name}" — screens crash on .resource`);
			}
			// Capture OUTSIDE render (react-compiler: renders must be pure).
			React.useEffect(() => {
				captured[name] = query;
			});
			// The screens read `query.resource`; it must be a live ObservableResource.
			const hasResource = query.resource !== undefined;
			return <div>{hasResource ? 'ok' : 'no-resource'}</div>;
		}

		const names = [...LEGACY_COLLECTION_NAMES, 'logs'];

		expect(() => {
			render(
				<Provider>
					{names.map((name) => (
						<Consumer key={name} name={name} />
					))}
				</Provider>
			);
		}).not.toThrow();

		for (const name of names) {
			expect(captured[name]).toBeDefined();
			expect(captured[name].resource).toBeDefined();
			expect(captured[name].result$).toBeDefined();
			expect(captured[name].rxQuery$).toBeDefined();
		}
	});

	it('a mapped-collection query emits an EMPTY result while pending, then live after the engine opens', async () => {
		const capturedQuery: { current: any } = { current: undefined };
		function Consumer() {
			const query = useQuery({ queryKeys: ['products', 'golive'], collectionName: 'products' });
			React.useEffect(() => {
				capturedQuery.current = query;
			});
			return <div />;
		}

		render(
			<Provider>
				<Consumer />
			</Provider>
		);

		const query = capturedQuery.current;
		expect(query).toBeDefined();

		// While pending: an empty, non-throwing result.
		const initial = await firstValueFrom(query.result$);
		expect(initial).toEqual(expect.objectContaining({ searchActive: false, hits: [], count: 0 }));

		// Seed the engine collection, then open the engine (active() → scope,
		// ready resolves). The manager nudges re-registration; the query goes live.
		await engineDB.collections.products.bulkInsert([
			engineProduct({ uuid: 'p1', id: 1, name: 'Alpha' }),
			engineProduct({ uuid: 'p2', id: 2, name: 'Beta' }),
		]);

		await act(async () => {
			pending.open();
			// let the engine.ready microtask + reset$ nudge flush
			await Promise.resolve();
			await Promise.resolve();
		});

		// After go-live, the (re-registered) query for this key resolves live docs.
		await waitFor(async () => {
			// The ready-nudge re-registers the query — read the CURRENT instance.
			const live = capturedQuery.current;
			const result = await firstValueFrom(live.result$.pipe(filter((r: any) => r.count > 0)));
			expect(result.count).toBe(2);
			expect(result.hits.map((h: any) => h.id).sort()).toEqual(['p1', 'p2']);
		});
	});
});
