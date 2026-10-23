/**
 * @jest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { Subject } from 'rxjs';

import { useAwaitingStoreCount, useAwaitsStore } from './use-awaiting-store';

let mockStoreDB: object | undefined = {};
const mockAwaiting$ = new Subject<ReadonlySet<string>>();
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ storeDB: mockStoreDB }),
}));
jest.mock('@wcpos/query/store-local', () => ({ observeAwaitingStore: () => mockAwaiting$ }));

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
