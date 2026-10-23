/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject, Subject } from 'rxjs';

import { useAwaitingStoreCount, useAwaitsStore } from './use-awaiting-store';

let mockStoreDB: object | undefined = {};
let mockAwaiting$: Subject<ReadonlySet<string>> = new Subject();
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB: mockStoreDB }),
}));
jest.mock('@wcpos/query/store-local', () => ({ observeAwaitingStore: () => mockAwaiting$ }));
beforeEach(() => {
	mockAwaiting$ = new Subject();
});

// ADR 0040 Decided 1 rule 1: the mark is never drawn from a guess.
it('is null until the journals first answer, then the answer; the count reads 0 meanwhile', () => {
	mockStoreDB = {};
	const { result } = renderHook(() => ({
		awaits: useAwaitsStore('a'),
		count: useAwaitingStoreCount(),
	}));
	expect(result.current).toEqual({ awaits: null, count: 0 });
	act(() => mockAwaiting$.next(new Set(['a', 'b'])));
	expect(result.current).toEqual({ awaits: true, count: 2 });
	act(() => mockAwaiting$.next(new Set()));
	expect(result.current).toEqual({ awaits: false, count: 0 });
});

it('with no store database nothing awaits', () => {
	mockStoreDB = undefined;
	const { result } = renderHook(() => useAwaitsStore('a'));
	expect(result.current).toBe(false);
});

it('a warm stream (the register bar holds it) answers on the first render', () => {
	mockStoreDB = {};
	mockAwaiting$ = new BehaviorSubject<ReadonlySet<string>>(new Set(['a']));
	const seen: (boolean | null)[] = [];
	renderHook(() => seen.push(useAwaitsStore('a')));
	expect(seen[0]).toBe(true);
});
