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

function makeStoreDB(label: string) {
	return {
		collections: { logs: { name: 'logs', label } as unknown as RxCollection },
		reset$: new Subject<RxCollection>(),
	};
}

describe('useCollection', () => {
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
			reset$: new Subject<RxCollection>(),
		};
		const { result, rerender } = renderHook(() => useCollection('scanner_profiles'));
		expect((result.current.collection as unknown as { label: string }).label).toBe('storeA');

		currentStoreDB = {
			collections: {
				scanner_profiles: { name: 'scanner_profiles', label: 'storeB' } as unknown as RxCollection,
			},
			reset$: new Subject<RxCollection>(),
		};
		rerender();

		expect((result.current.collection as unknown as { label: string }).label).toBe('storeB');
	});
});
