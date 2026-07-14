import * as React from 'react';

import { cleanup, renderHook } from '@testing-library/react';
import { firstValueFrom } from 'rxjs';
import { filter } from 'rxjs/operators';

import { coverageLaneSchema, queryTotalCacheSchema } from '@wcpos/sync-engine/testing';

import { httpClientMock } from './__mocks__/http';
import { createStoreDatabase } from './helpers/db';
import { createEngineDatabase, createFakeEngine } from './helpers/engine';
import { Manager } from '../src/manager';
import { QueryProvider } from '../src/provider';
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
});
