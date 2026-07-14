import * as React from 'react';

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';

import { coverageLaneSchema, queryTotalCacheSchema } from '@wcpos/sync-engine/testing';

import { httpClientMock } from './__mocks__/http';
import { createStoreDatabase } from './helpers/db';
import { createEngineDatabase, createFakeEngine, createPendingFakeEngine } from './helpers/engine';
import { Manager } from '../src/manager';
import { QueryProvider } from '../src/provider';
import { useQuery } from '../src/use-query';
import { useReplicationState } from '../src/use-replication-state';

import type { FakeEngine } from './helpers/engine';
import type { RxDatabase } from 'rxdb';

describe('useReplicationState', () => {
	let localDB: RxDatabase;
	let engineDB: RxDatabase;
	let engine: FakeEngine;
	let manager: Manager<RxDatabase>;

	beforeEach(async () => {
		localDB = await createStoreDatabase();
		engineDB = await createEngineDatabase(['products']);
		await engineDB.addCollections({
			coverageLanes: { schema: coverageLaneSchema },
			queryTotalCacheEntries: { schema: queryTotalCacheSchema },
		} as never);
		engine = createFakeEngine(engineDB);
		manager = Manager.getInstance(localDB, engine, 'en', httpClientMock);
	});

	afterEach(async () => {
		await manager.cancel();
		if (!localDB.destroyed) await localDB.remove();
		if (!engineDB.destroyed) await engineDB.remove();
		cleanup();
	});

	it('projects whether total$ is verified coverage or a local-count fallback', async () => {
		const query = manager.registerQuery({
			queryKeys: ['hook-total-source'],
			collectionName: 'products',
			initialParams: {},
		});
		if (!query) throw new Error('product query was not registered');
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<QueryProvider localDB={localDB} engine={engine} http={httpClientMock} locale="en">
				{children}
			</QueryProvider>
		);
		const { result } = renderHook(() => useReplicationState(query), { wrapper });

		await expect(firstValueFrom(result.current.totalSource$)).resolves.toBe('local');

		await engineDB.collections.coverageLanes.insert({
			laneKey: 'products::products:browse-window:limit=100',
			collectionName: 'products',
			queryKey: 'products:browse-window:limit=100',
			complete: true,
			expectedRecordIds: ['woo-product:1', 'woo-product:2'],
			freshUntilMs: Date.now() + 60_000,
			updatedAtMs: Date.now(),
			schemaVersion: 2,
		});

		await expect(
			firstValueFrom(result.current.totalSource$.pipe(filter((source) => source === 'coverage')))
		).resolves.toBe('coverage');
	});

	it('rebinds the total projections when a pending query is replaced under the same id', async () => {
		const pending = createPendingFakeEngine(engineDB);
		engine = pending.engine;
		manager = Manager.getInstance(localDB, engine, 'en', httpClientMock);
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<QueryProvider localDB={localDB} engine={engine} http={httpClientMock} locale="en">
				{children}
			</QueryProvider>
		);
		const { result } = renderHook(
			() => {
				const query = useQuery({
					queryKeys: ['hook-total-source-rebind'],
					collectionName: 'products',
					initialParams: {},
				});
				if (!query) throw new Error('product query was not registered');
				return { query, replicationState: useReplicationState(query) };
			},
			{ wrapper }
		);
		const pendingQuery = result.current.query;
		const totals: number[] = [];
		const sources: string[] = [];
		const totalSubscription = result.current.replicationState.total$.subscribe((total) =>
			totals.push(total)
		);
		const sourceSubscription = result.current.replicationState.totalSource$.subscribe((source) =>
			sources.push(source)
		);

		expect(totals).toEqual([0]);
		expect(sources).toEqual(['local']);

		await engineDB.collections.coverageLanes.insert({
			laneKey: 'products::products:browse-window:limit=100',
			collectionName: 'products',
			queryKey: 'products:browse-window:limit=100',
			complete: true,
			expectedRecordIds: ['woo-product:1', 'woo-product:2'],
			freshUntilMs: Date.now() + 60_000,
			updatedAtMs: Date.now(),
			schemaVersion: 2,
		});

		try {
			await act(async () => {
				pending.open();
				await Promise.resolve();
				await Promise.resolve();
			});

			await waitFor(() => {
				expect(result.current.query).not.toBe(pendingQuery);
				expect(result.current.query.id).toBe(pendingQuery.id);
				expect(totals.at(-1)).toBe(2);
			});
			expect(sources.at(-1)).toBe('coverage');
		} finally {
			totalSubscription.unsubscribe();
			sourceSubscription.unsubscribe();
		}
	});
});
