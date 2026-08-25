/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { renderHook } from '@testing-library/react';
import { Subject } from 'rxjs';

import { useCollection } from './use-collection';

import type { RxCollection } from 'rxdb';

let currentStoreDB: { collections: Record<string, unknown>; reset$: Subject<RxCollection> };

jest.mock('../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB: currentStoreDB }),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));

/**
 * In production `reset$` is ONE module-level Subject shared by every open store
 * database (`reset-collection.ts`), so a per-database Subject here would model
 * a world the app does not have and hide any cross-store leak. `sharedReset$`
 * is that single subject; give each database its own only to test the case
 * where a database has no reset traffic at all.
 */
let sharedReset$: Subject<RxCollection>;

function makeStoreDB(label: string, reset$: Subject<RxCollection> = sharedReset$) {
	return {
		collections: { logs: { name: 'logs', label } as unknown as RxCollection },
		reset$,
	};
}

describe('useCollection', () => {
	beforeEach(() => {
		sharedReset$ = new Subject<RxCollection>();
	});

	it('follows a reset of the same store database', () => {
		const db = makeStoreDB('A');
		currentStoreDB = db;
		const { result, rerender } = renderHook(() => useCollection('logs'));
		expect((result.current.collection as unknown as { label: string }).label).toBe('A');

		const replacement = { name: 'logs', label: 'A-reset' } as unknown as RxCollection;
		db.collections.logs = replacement;
		db.reset$.next(replacement);
		rerender();

		expect((result.current.collection as unknown as { label: string }).label).toBe('A-reset');
	});

	it('follows a STORE SWITCH to a different store database', () => {
		currentStoreDB = makeStoreDB('storeA');
		const { result, rerender } = renderHook(() => useCollection('logs'));
		expect((result.current.collection as unknown as { label: string }).label).toBe('storeA');

		// The store switch: useStoreSession now yields a different database.
		// Nothing is "reset" — reset$ never emits — so a hook that only listens
		// to reset$ keeps handing back store A's collection, and the logger
		// writes every subsequent entry into the store the cashier just left.
		currentStoreDB = makeStoreDB('storeB');
		rerender();

		expect((result.current.collection as unknown as { label: string }).label).toBe('storeB');
	});

	it('follows a STORE SWITCH for scanner_profiles too (same generic hook)', () => {
		currentStoreDB = {
			collections: {
				scanner_profiles: { name: 'scanner_profiles', label: 'storeA' } as unknown as RxCollection,
			},
			reset$: sharedReset$,
		};
		const { result, rerender } = renderHook(() => useCollection('scanner_profiles'));
		expect((result.current.collection as unknown as { label: string }).label).toBe('storeA');

		currentStoreDB = {
			collections: {
				scanner_profiles: { name: 'scanner_profiles', label: 'storeB' } as unknown as RxCollection,
			},
			reset$: sharedReset$,
		};
		rerender();

		expect((result.current.collection as unknown as { label: string }).label).toBe('storeB');
	});

	/**
	 * The cross-store leak. `reset$` carries every open store's resets, so a
	 * name-only filter lets store A's storage recovery — finishing after the
	 * cashier switched to store B — hand B's mounted reader store A's
	 * collection. Every write the component then makes lands in the wrong store.
	 */
	it('IGNORES a reset belonging to a different store database', () => {
		const storeA = makeStoreDB('storeA');
		currentStoreDB = makeStoreDB('storeB');
		const { result, rerender } = renderHook(() => useCollection('logs'));
		expect((result.current.collection as unknown as { label: string }).label).toBe('storeB');

		// Store A's recovery completes, announcing on the shared subject.
		const aReplacement = {
			name: 'logs',
			label: 'storeA-reset',
			database: storeA,
		} as unknown as RxCollection;
		storeA.collections.logs = aReplacement;
		sharedReset$.next(aReplacement);
		// `rerender` is load-bearing: without it `result.current` is never
		// refreshed and the assertion passes against ANY filter, leaked value
		// included — the sibling tests above rerender for the same reason.
		rerender();

		expect((result.current.collection as unknown as { label: string }).label).toBe('storeB');
	});
});
