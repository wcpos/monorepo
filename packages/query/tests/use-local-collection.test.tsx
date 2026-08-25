/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { cleanup, renderHook } from '@testing-library/react';
import { Subject } from 'rxjs';

import { QueryProvider } from '../src/provider';
import { useLocalCollection$ } from '../src/use-local-collection';
import { createEngineDatabase, createFakeEngine } from '../src/testing';

import type { RxCollection, RxDatabase } from 'rxdb';

/**
 * The shared mechanism behind every local-collection reader (useLocalQuery, the
 * logs stat header, the drawer badge). A collection reference is not stable:
 * logs-storage-recovery replaces it IN PLACE announcing only on `reset$`, and a
 * store switch replaces the whole database announcing nothing on `reset$`.
 */
describe('useLocalCollection$', () => {
	let engineDB: RxDatabase;

	beforeEach(async () => {
		engineDB = await createEngineDatabase();
	});
	afterEach(async () => {
		cleanup();
		if (!engineDB.destroyed) await engineDB.remove();
	});

	const collectionNamed = (label: string) => ({ name: 'logs', label }) as unknown as RxCollection;

	function harness(db: unknown) {
		const engine = createFakeEngine(engineDB);
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<QueryProvider localDB={db as RxDatabase} engine={engine} locale="en">
				{children}
			</QueryProvider>
		);
		return renderHook(() => useLocalCollection$('logs'), { wrapper });
	}

	const latest = (obs: ReturnType<typeof useLocalCollection$>) => {
		let seen: unknown;
		obs.subscribe((value) => (seen = value)).unsubscribe();
		return (seen as { label?: string } | undefined)?.label;
	};

	it('emits the current collection synchronously on subscribe', () => {
		const db = { collections: { logs: collectionNamed('first') }, reset$: new Subject() };
		const { result } = harness(db);
		expect(latest(result.current)).toBe('first');
	});

	it('follows an in-place replacement announced on reset$ with NO re-render', () => {
		const reset$ = new Subject<RxCollection>();
		const db = { collections: { logs: collectionNamed('before') }, reset$ };
		const { result } = harness(db);

		const replacement = collectionNamed('after');
		db.collections.logs = replacement;
		reset$.next(replacement);

		// same observable instance, no re-render — it must carry the replacement
		expect(latest(result.current)).toBe('after');
	});

	it('ignores a reset for a DIFFERENT collection', () => {
		const reset$ = new Subject<RxCollection>();
		const db = { collections: { logs: collectionNamed('mine') }, reset$ };
		const { result } = harness(db);

		reset$.next({ name: 'templates', label: 'not-mine' } as unknown as RxCollection);

		expect(latest(result.current)).toBe('mine');
	});

	it('follows a store switch (a different localDB, reset$ silent)', () => {
		const engine = createFakeEngine(engineDB);
		const dbA = { collections: { logs: collectionNamed('storeA') }, reset$: new Subject() };
		const dbB = { collections: { logs: collectionNamed('storeB') }, reset$: new Subject() };
		let db: unknown = dbA;
		const wrapper = ({ children }: { children: React.ReactNode }) => (
			<QueryProvider localDB={db as RxDatabase} engine={engine} locale="en">
				{children}
			</QueryProvider>
		);
		const { result, rerender } = renderHook(() => useLocalCollection$('logs'), { wrapper });
		expect(latest(result.current)).toBe('storeA');

		db = dbB;
		rerender();

		expect(latest(result.current)).toBe('storeB');
	});

	/**
	 * `reset$` is one process-wide Subject shared by every open store database
	 * (`reset-collection.ts`), so these two pin the owner check: a foreign
	 * replacement must be refused, this database's own must still arrive.
	 *
	 * Both hold a LIVE subscription across the emission and read what it
	 * delivered, rather than subscribing afterwards and reading
	 * `collections[name]` back. A plain Subject does not replay, so a test that
	 * subscribes after the fact never observes the reset path at all and passes
	 * against any filter — including no filter.
	 */
	const track = (obs: ReturnType<typeof useLocalCollection$>) => {
		const seen: (string | undefined)[] = [];
		const subscription = obs.subscribe((value) =>
			seen.push((value as { label?: string } | undefined)?.label)
		);
		return { seen, unsubscribe: () => subscription.unsubscribe() };
	};

	it('ignores a reset announced for ANOTHER open store database', () => {
		const reset$ = new Subject<RxCollection>();
		const db = { collections: { logs: collectionNamed('mine') }, reset$ };
		const otherDB = { collections: { logs: collectionNamed('other-store') }, reset$ };
		const { result } = harness(db);
		const { seen, unsubscribe } = track(result.current);

		// Store A's storage recovery finishes AFTER the cashier switched to store B.
		reset$.next({
			name: 'logs',
			label: 'other-store',
			database: otherDB,
		} as unknown as RxCollection);
		unsubscribe();

		expect(seen).toEqual(['mine']);
	});

	it('follows a replacement that names THIS database as its owner', () => {
		const reset$ = new Subject<RxCollection>();
		const db = { collections: { logs: collectionNamed('before') }, reset$ };
		const { result } = harness(db);
		const { seen, unsubscribe } = track(result.current);

		// `collections` is deliberately NOT mutated: the only route to 'after' is
		// the reset$ emission itself.
		reset$.next({
			name: 'logs',
			label: 'after',
			database: db,
		} as unknown as RxCollection);
		unsubscribe();

		expect(seen).toEqual(['before', 'after']);
	});

	it('tolerates a database with no reset$ at all', () => {
		const { result } = harness({ collections: { logs: collectionNamed('plain') } });
		expect(latest(result.current)).toBe('plain');
	});
});
