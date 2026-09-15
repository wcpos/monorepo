/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { cleanup, render, renderHook, waitFor } from '@testing-library/react';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { firstValueFrom, Observable } from 'rxjs';

import { QueryProvider } from '../src/provider';
import { scanSelectorFor, useLocalQuery } from '../src/use-local-query';
import { createStoreDatabase } from './helpers/db';
import { logsLiteral } from './helpers/schemas/logs';
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
			expect(result.current.resource.valueRef$$.value?.current?.hits[0]?.record.code).toBe('C')
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

	it('follows a collection replaced in place with no re-render (storage recovery)', async () => {
		await localDB.collections.logs.bulkInsert([
			{ logId: 'before', timestamp: 1, code: 'A', level: 'info', message: 'before switch' },
		]);

		const engine = createFakeEngine(engineDB);
		let query: ReturnType<typeof useLocalQuery> | undefined;
		function Probe() {
			const currentQuery = useLocalQuery({
				collectionName: 'logs',
				sort: [{ timestamp: 'desc' }],
			});
			React.useEffect(() => {
				query = currentQuery;
			}, [currentQuery]);
			return null;
		}

		render(
			<QueryProvider localDB={localDB} engine={engine} locale="en">
				<Probe />
			</QueryProvider>
		);

		await waitFor(() =>
			expect(query?.resource.valueRef$$.value?.current?.hits[0]?.id).toBe('before')
		);

		// --- the store switch: reset-collection removes and re-creates `logs` ---
		await localDB.collections.logs.remove();
		const recreated = await localDB.addCollections({ logs: { schema: logsLiteral } });
		(localDB as unknown as { reset$: { next(c: RxCollection): void } }).reset$.next(
			recreated.logs as RxCollection
		);

		// The cashier adds a product to the cart; the logger (which follows reset$)
		// writes into the replacement collection.
		await recreated.logs.insert({
			logId: 'after',
			timestamp: 2,
			code: 'B',
			level: 'info',
			message: 'added product to cart',
		});

		// The row exists in the database a remount would read...
		expect(await recreated.logs.count().exec()).toBe(1);

		// ...so the mounted table must surface it too. This is the user's symptom.
		await waitFor(
			() => expect(query?.resource.valueRef$$.value?.current?.hits[0]?.id).toBe('after'),
			{ timeout: 3000 }
		);
	});
});

describe('useLocalQuery scan search (collections that refuse an index)', () => {
	// logs: a 46k-row day cost 21.5 s and ~350 MB to index in the renderer and
	// crashed the tab (2026-09-15). A collection with `searchIndex: false` is
	// searched by a bounded, storage-evaluated substring scan instead, and the
	// index is never asked for.
	let scanDB: RxDatabase;
	let engineDB: RxDatabase;
	let initSearch: jest.Mock;

	beforeEach(async () => {
		scanDB = await createRxDatabase({
			name: `scan_${Date.now()}_${Math.random().toString(36).slice(2)}`,
			storage: getRxStorageMemory(),
			allowSlowCount: true,
		});
		await scanDB.addCollections({
			logs: {
				schema: logsLiteral,
				options: { searchFields: ['message', 'context.search'], searchIndex: false },
			},
		});
		initSearch = jest.fn(async () => {
			throw new Error('the index must never be built for a scan-searched collection');
		});
		(scanDB.collections.logs as unknown as { initSearch: unknown }).initSearch = initSearch;
		await scanDB.collections.logs.bulkInsert([
			{
				logId: 'a',
				timestamp: 3,
				level: 'warn',
				message: '"products/992915" cannot download — products 992915 — pull escalation',
				context: { search: 'wcpos.sync.engine missing_stored 992915' },
			},
			{
				logId: 'b',
				timestamp: 2,
				level: 'warn',
				message: '"products/992912" cannot download — products 992912 — pull escalation',
				context: { search: 'wcpos.sync.engine missing_stored 992912' },
			},
			{
				logId: 'c',
				timestamp: 1,
				level: 'info',
				message: 'Pull escalation cleared',
				context: { search: 'wcpos.sync.engine 992915' },
			},
			{
				logId: 'd',
				timestamp: 0,
				level: 'error',
				message: 'Conexión rechazada',
				context: { search: 'wcpos.http' },
			},
			{
				logId: 'e',
				timestamp: -1,
				level: 'error',
				// Decomposed (NFD): o + combining acute, as some servers and inputs store it.
				message: 'Conexión perdida',
				context: { search: 'wcpos.http' },
			},
		]);
		engineDB = await createEngineDatabase();
	});

	afterEach(async () => {
		cleanup();
		if (!scanDB.destroyed) await scanDB.remove();
		if (!engineDB.destroyed) await engineDB.remove();
	});

	function mount(search: string, selector: Record<string, unknown> = {}) {
		const engine = createFakeEngine(engineDB);
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<QueryProvider localDB={scanDB} engine={engine} locale="en">
				{children}
			</QueryProvider>
		);
		return renderHook(
			({ term }) =>
				useLocalQuery({
					collectionName: 'logs',
					selector,
					sort: [{ timestamp: 'desc' }],
					limit: 20,
					search: term,
				}),
			{ wrapper, initialProps: { term: search } }
		);
	}

	const hitIds = (result: { current: ReturnType<typeof useLocalQuery> }) =>
		result.current.resource.valueRef$$.value?.current?.hits.map((hit) => hit.id);

	it('matches case-insensitively, AND across tokens, OR across fields, without the index', async () => {
		const { result } = mount('ESCALATION 992915');
		// Both tokens must land: row a (message + context), row c (message has
		// "escalation", context has 992915) — row b lacks 992915 entirely.
		await waitFor(() => expect(hitIds(result)).toEqual(['a', 'c']));
		await expect(firstValueFrom(result.current.total$)).resolves.toBe(2);
		expect(initSearch).not.toHaveBeenCalled();
	});

	it('treats punctuation-bearing terms as literal substrings', async () => {
		const { result } = mount('products/992912');
		await waitFor(() => expect(hitIds(result)).toEqual(['b']));
		expect(initSearch).not.toHaveBeenCalled();
	});

	it('matches accented text from either spelling (what the index gave; Codex review)', async () => {
		// Precomposed (row d) AND decomposed (row e) stored text, from either spelling.
		const exact = mount('Conexión');
		await waitFor(() => expect(hitIds(exact.result)).toEqual(['d', 'e']));
		const folded = mount('conexion');
		await waitFor(() => expect(hitIds(folded.result)).toEqual(['d', 'e']));
		expect(initSearch).not.toHaveBeenCalled();
	});

	it('composes the scan with the caller selector and yields no rows for an unusable term', async () => {
		const { result } = mount('pull escalation', { level: { $eq: 'warn' } });
		await waitFor(() => expect(hitIds(result)).toEqual(['a', 'b']));
		const { result: empty } = mount('---');
		await waitFor(() => expect(hitIds(empty)).toEqual([]));
		await expect(firstValueFrom(empty.current.total$)).resolves.toBe(0);
	});
});

describe('scanSelectorFor', () => {
	type Clause = { $or: Record<string, { $regex: string; $options: string }>[] };
	const clauses = (fields: string[], search: string) =>
		(scanSelectorFor(fields, search) as { $and: Clause[] }).$and;
	const regexOf = (clause: Clause, field: string) => {
		const match = clause.$or.find((part) => field in part)?.[field];
		if (!match) throw new Error(`no ${field} clause`);
		return new RegExp(match.$regex, match.$options);
	};

	it('builds one AND clause per encoder token, one OR arm per field', () => {
		const built = clauses(['message', 'context.search'], 'Pull (esc.alation)');
		expect(built).toHaveLength(2);
		for (const clause of built) {
			expect(clause.$or.map((part) => Object.keys(part)[0])).toEqual(['message', 'context.search']);
			expect(clause.$or.every((part) => Object.values(part)[0].$options === 'i')).toBe(true);
		}
	});

	it('escapes regex metacharacters so a term is a literal substring', () => {
		const [, dotted] = clauses(['message'], 'Pull (esc.alation)');
		expect(regexOf(dotted, 'message').test('ESC.ALATION')).toBe(true);
		expect(regexOf(dotted, 'message').test('escXalation')).toBe(false);
	});

	it('matches accented and unaccented spellings of a letter alike', () => {
		const [term] = clauses(['message'], 'Conexión');
		const regex = regexOf(term, 'message');
		expect(regex.test('Conexión rechazada')).toBe(true);
		expect(regex.test('CONEXION')).toBe(true);
		expect(regex.test('Conexiön')).toBe(true);
		expect(regex.test('Conexxion')).toBe(false);
	});

	it('matches decomposed marks and precomposed letters beyond Latin Extended-B (Codex review)', () => {
		const [term] = clauses(['message'], 'conexion');
		expect(regexOf(term, 'message').test('Conexión')).toBe(true); // NFD o + U+0301
		const [viet] = clauses(['message'], 'tien');
		expect(regexOf(viet, 'message').test('tiến')).toBe(true); // ế is U+1EBF (Latin Extended Additional)
	});

	it('returns null when nothing can be selected', () => {
		expect(scanSelectorFor([], 'pull')).toBeNull();
		expect(scanSelectorFor(['message'], '   ')).toBeNull();
	});

	it('drops terms under the index minimum, as the index did (Codex review)', () => {
		// "pull x" meant "pull" to FlexSearch (minlength 3); "x" alone found nothing.
		expect(clauses(['message'], 'pull x')).toHaveLength(1);
		expect(scanSelectorFor(['message'], 'x')).toBeNull();
	});
});
