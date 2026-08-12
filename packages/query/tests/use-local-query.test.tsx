/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { firstValueFrom, Observable } from 'rxjs';

import { QueryProvider } from '../src/provider';
import { useLocalQuery } from '../src/use-local-query';
import { createStoreDatabase } from './helpers/db';
import { createEngineDatabase, createFakeEngine } from '../src/testing';

import type { RxCollection, RxDatabase } from 'rxdb';

function localCollectionHarness(ids: string[]) {
	let activeSubscriptions = 0;
	const tracked = <T,>(value: T) =>
		new Observable<T>((subscriber) => {
			activeSubscriptions += 1;
			subscriber.next(value);
			return () => {
				activeSubscriptions -= 1;
			};
		});
	const documents = ids.map((primary) => ({ primary, code: primary }));
	const collection = {
		find: () => ({ $: tracked(documents) }),
		count: () => ({ $: tracked(ids.length) }),
	} as unknown as RxCollection;
	return { collection, activeSubscriptions: () => activeSubscriptions };
}

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
			{ logId: '1', timestamp: 1, code: 'A', level: 'error', message: 'one' },
			{ logId: '2', timestamp: 2, code: 'B', level: 'error', message: 'two' },
			{ logId: '3', timestamp: 3, code: 'C', level: 'info', message: 'three' },
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

	it('returns an empty result when the logs collection is unavailable', async () => {
		const engine = createFakeEngine(engineDB);
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<QueryProvider localDB={engineDB} engine={engine} locale="en">
				{children}
			</QueryProvider>
		);
		const { result } = renderHook(() => useLocalQuery({ collectionName: 'logs' }), { wrapper });

		await expect(firstValueFrom(result.current.result$)).resolves.toEqual({
			searchActive: false,
			count: 0,
			hits: [],
		});
	});

	it('rebinds locale-sensitive search and releases the previous search subscription', async () => {
		await localDB.collections.logs.bulkInsert([
			{ logId: 'en', timestamp: 1, code: 'EN', level: 'info', message: 'English' },
			{ logId: 'fr', timestamp: 2, code: 'FR', level: 'info', message: 'French' },
		]);
		const logs = localDB.collections.logs as RxCollection;
		const released: string[] = [];
		const initSearch = jest.spyOn(logs, 'initSearch').mockImplementation(
			async (locale: string) =>
				({
					collection: {
						$: new Observable<void>((subscriber) => {
							subscriber.next();
							return () => released.push(locale);
						}),
					},
					find: async () => {
						const document = await logs.findOne(locale).exec();
						return document ? [document] : [];
					},
				}) as never
		);
		const engine = createFakeEngine(engineDB);
		let query: ReturnType<typeof useLocalQuery> | undefined;
		function Probe() {
			const currentQuery = useLocalQuery({ collectionName: 'logs', search: 'localized' });
			React.useEffect(() => {
				// The test probe exposes the hook result after React commits it.
				query = currentQuery;
			}, [currentQuery]);
			return null;
		}
		const view = render(
			<QueryProvider localDB={localDB} engine={engine} locale="en">
				<Probe />
			</QueryProvider>
		);
		await waitFor(() => expect(query?.resource.valueRef$$.value?.current?.hits[0]?.id).toBe('en'));

		view.rerender(
			<QueryProvider localDB={localDB} engine={engine} locale="fr">
				<Probe />
			</QueryProvider>
		);

		await waitFor(() => expect(query?.resource.valueRef$$.value?.current?.hits[0]?.id).toBe('fr'));
		expect(initSearch.mock.calls.map(([locale]) => locale)).toEqual(['en', 'fr']);
		expect(released).toContain('en');
		expect(released).not.toContain('fr');
	});

	it('releases old subscriptions and reads results from a swapped localDB', async () => {
		const first = localCollectionHarness(['old']);
		const second = localCollectionHarness(['new']);
		const firstDB = { collections: { logs: first.collection } } as unknown as RxDatabase;
		const secondDB = { collections: { logs: second.collection } } as unknown as RxDatabase;
		const engine = createFakeEngine(engineDB);
		let query: ReturnType<typeof useLocalQuery> | undefined;
		function Probe() {
			const currentQuery = useLocalQuery({ collectionName: 'logs' });
			React.useEffect(() => {
				// The test probe exposes the hook result after React commits it.
				query = currentQuery;
			}, [currentQuery]);
			return null;
		}
		const view = render(
			<QueryProvider localDB={firstDB} engine={engine} locale="en">
				<Probe />
			</QueryProvider>
		);
		await waitFor(() => expect(query?.resource.valueRef$$.value?.current?.hits[0]?.id).toBe('old'));
		expect(first.activeSubscriptions()).toBe(2);

		view.rerender(
			<QueryProvider localDB={secondDB} engine={engine} locale="en">
				<Probe />
			</QueryProvider>
		);

		await waitFor(() => expect(query?.resource.valueRef$$.value?.current?.hits[0]?.id).toBe('new'));
		expect(first.activeSubscriptions()).toBe(0);
		expect(second.activeSubscriptions()).toBe(2);
	});

	it('total$ emits the replacement collection count after reset', async () => {
		const beforeReset = localCollectionHarness(['1', '2']);
		const afterReset = localCollectionHarness(['3']);
		const collections = { logs: beforeReset.collection };
		const database = { collections } as unknown as RxDatabase;
		const engine = createFakeEngine(engineDB);
		let query: ReturnType<typeof useLocalQuery> | undefined;
		function Probe() {
			const currentQuery = useLocalQuery({ collectionName: 'logs' });
			React.useEffect(() => {
				// The test probe exposes the hook result after React commits it.
				query = currentQuery;
			}, [currentQuery]);
			return null;
		}
		const view = render(
			<QueryProvider localDB={database} engine={engine} locale="en">
				<Probe />
			</QueryProvider>
		);
		await waitFor(() => expect(query?.resource.valueRef$$.value?.current?.count).toBe(2));
		await expect(firstValueFrom(query!.total$)).resolves.toBe(2);

		collections.logs = afterReset.collection;
		view.rerender(
			<QueryProvider localDB={database} engine={engine} locale="en">
				<Probe />
			</QueryProvider>
		);

		await waitFor(() => expect(query?.resource.valueRef$$.value?.current?.count).toBe(1));
		await expect(firstValueFrom(query!.total$)).resolves.toBe(1);
		expect(beforeReset.activeSubscriptions()).toBe(0);
		expect(afterReset.activeSubscriptions()).toBe(2);
	});
});
