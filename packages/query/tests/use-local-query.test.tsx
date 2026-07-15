/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { firstValueFrom } from 'rxjs';

import { QueryProvider } from '../src/provider';
import { useLocalQuery } from '../src/use-local-query';
import { createStoreDatabase } from './helpers/db';
import { createEngineDatabase, createFakeEngine } from './helpers/engine';

import type { RxCollection, RxDatabase } from 'rxdb';

describe('useLocalQuery', () => {
	let localDB: RxDatabase;
	let engineDB: RxDatabase;

	beforeEach(async () => {
		localDB = await createStoreDatabase();
		engineDB = await createEngineDatabase();
		const logs = localDB.collections.logs as RxCollection;
		(logs as unknown as { initSearch: () => Promise<unknown> }).initSearch = async () => ({
			collection: logs,
			find: async (term: string) => {
				const documents = await logs.find().exec();
				return documents.filter((document) =>
					JSON.stringify(document.toJSON()).toLowerCase().includes(term.toLowerCase())
				);
			},
		});
	});

	afterEach(async () => {
		cleanup();
		if (!localDB.destroyed) await localDB.remove();
		if (!engineDB.destroyed) await engineDB.remove();
	});

	it('binds filtered local logs with an unwindowed total and search', async () => {
		await localDB.collections.logs.bulkInsert([
			{ logId: '1', timestamp: 1, code: 'A', level: 'error', message: 'one', context: {} },
			{ logId: '2', timestamp: 2, code: 'B', level: 'error', message: 'two', context: {} },
			{ logId: '3', timestamp: 3, code: 'C', level: 'info', message: 'three', context: {} },
		]);
		const engine = createFakeEngine(engineDB);
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<QueryProvider localDB={localDB} engine={engine} locale="en">
				{children}
			</QueryProvider>
		);
		const { result, rerender } = renderHook(
			({ search }) =>
				useLocalQuery({
					collectionName: 'logs',
					selector: search ? {} : { level: { $in: ['error'] } },
					sort: [{ timestamp: 'desc' }],
					limit: 1,
					search,
				}),
			{ wrapper, initialProps: { search: '' } }
		);

		await waitFor(() =>
			expect(result.current.resource.valueRef$$.value?.current?.hits).toHaveLength(1)
		);
		await expect(firstValueFrom(result.current.total$)).resolves.toBe(2);

		rerender({ search: 'three' });
		await waitFor(() =>
			expect(result.current.resource.valueRef$$.value?.current?.hits[0]?.document.code).toBe('C')
		);
		await expect(firstValueFrom(result.current.total$)).resolves.toBe(1);
	});
});
