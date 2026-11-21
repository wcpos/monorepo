/** @jest-environment jsdom */
import type { AppStateStatus } from 'react-native';

import { act, renderHook } from '@testing-library/react';
import { BehaviorSubject, Subject } from 'rxjs';

import type { EngineRecord } from '@wcpos/query';
import { remoteIdOrNull } from '@wcpos/sync-core';

import { useRenderedOrderRefresh } from './use-rendered-order-refresh';
import { manualSyncInFlight$ } from '../health/manual-sync-in-flight';

type Result = { hits: { record?: Pick<EngineRecord<'orders'>, 'remoteId'> }[] };
const hit = (id: number | null): Result['hits'][number] => ({
	record: { remoteId: remoteIdOrNull(id) },
});
const mockRequire = jest.fn();
const mockEngine = { require: mockRequire };
let mockFocused = true;
const mockListeners = new Set<(state: AppStateStatus) => void>();
const mockAppState = {
	currentState: 'active' as AppStateStatus,
	addEventListener: jest.fn((_event: string, listener: (state: AppStateStatus) => void) => {
		mockListeners.add(listener);
		return { remove: () => mockListeners.delete(listener) };
	}),
};

jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('react-native', () => ({
	get AppState() {
		return mockAppState;
	},
}));
jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => ({ engine: mockEngine }) }));
jest.mock('../health/manual-sync-in-flight', () => ({
	manualSyncInFlight$: new (jest.requireActual('rxjs').BehaviorSubject)(false),
}));

function pendingHandle() {
	let resolve!: () => void;
	const ready = new Promise<void>((done) => {
		resolve = done;
	});
	return { ready, release: jest.fn(), resolve };
}

function appState(state: AppStateStatus) {
	act(() => {
		mockAppState.currentState = state;
		mockListeners.forEach((listener) => listener(state));
	});
}

describe('useRenderedOrderRefresh', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		mockFocused = true;
		mockAppState.currentState = 'active';
		mockListeners.clear();
		mockAppState.addEventListener.mockClear();
		manualSyncInFlight$.next(false);
		mockRequire
			.mockReset()
			.mockImplementation(() => ({ ready: Promise.resolve(), release: jest.fn() }));
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it('H1: refreshes remote rows at mount and every 60 seconds, releasing settled handles', async () => {
		const results$ = new BehaviorSubject<Result>({ hits: [hit(7), hit(null), hit(8)] });
		const first = pendingHandle();
		const second = pendingHandle();
		mockRequire.mockReturnValueOnce(first).mockReturnValueOnce(second);
		renderHook(() => useRenderedOrderRefresh(results$));
		expect(mockRequire).toHaveBeenCalledTimes(1);
		expect(mockRequire).toHaveBeenCalledWith({
			id: 'orders:rendered-refresh',
			collection: 'orders',
			kind: 'targeted-records',
			remoteIds: [remoteIdOrNull(7), remoteIdOrNull(8)],
			forceRefresh: true,
		});
		expect(first.release).not.toHaveBeenCalled();
		await act(async () => {
			first.resolve();
		});
		expect(first.release).toHaveBeenCalledTimes(1);
		act(() => {
			results$.next({ hits: [hit(9)] });
		});
		expect(mockRequire).toHaveBeenCalledTimes(1);
		act(() => {
			jest.advanceTimersByTime(60_000);
		});
		expect(mockRequire).toHaveBeenCalledTimes(2);
		expect(mockRequire).toHaveBeenLastCalledWith(
			expect.objectContaining({ remoteIds: [remoteIdOrNull(9)] })
		);
		await act(async () => {
			second.resolve();
		});
		expect(second.release).toHaveBeenCalledTimes(1);
	});

	it('H2: stays idle without focus and fires immediately when focused', async () => {
		mockFocused = false;
		const results$ = new BehaviorSubject<Result>({ hits: [hit(7)] });
		const { rerender } = renderHook(() => useRenderedOrderRefresh(results$));
		act(() => {
			jest.advanceTimersByTime(120_000);
			manualSyncInFlight$.next(true);
		});
		expect(mockRequire).not.toHaveBeenCalled();
		mockFocused = true;
		rerender();
		expect(mockRequire).toHaveBeenCalledTimes(1);
		await act(async () => {});
		mockFocused = false;
		rerender();
		act(() => {
			jest.advanceTimersByTime(120_000);
		});
		expect(mockRequire).toHaveBeenCalledTimes(1);
		mockFocused = true;
		rerender();
		expect(mockRequire).toHaveBeenCalledTimes(2);
	});

	it('H3: pauses in the background and fires immediately on returning to active', async () => {
		const results$ = new BehaviorSubject<Result>({ hits: [hit(7)] });
		renderHook(() => useRenderedOrderRefresh(results$));
		await act(async () => {});
		appState('background');
		act(() => {
			jest.advanceTimersByTime(120_000);
		});
		expect(mockRequire).toHaveBeenCalledTimes(1);
		appState('active');
		expect(mockRequire).toHaveBeenCalledTimes(2);
	});

	it('H4: keeps the first 100 distinct ids in rendered order', () => {
		const hits = Array.from({ length: 150 }, (_, index) => hit(150 - index));
		const results$ = new BehaviorSubject<Result>({ hits: [hits[0], hit(null), ...hits] });
		renderHook(() => useRenderedOrderRefresh(results$));
		expect(mockRequire).toHaveBeenCalledTimes(1);
		expect(mockRequire).toHaveBeenCalledWith(
			expect.objectContaining({
				remoteIds: hits.slice(0, 100).map(({ record }) => record!.remoteId),
			})
		);
	});

	it('H4: does nothing with all local ids or results that have not arrived', () => {
		const local$ = new BehaviorSubject<Result>({ hits: [hit(null), hit(null), {}] });
		const { unmount } = renderHook(() => useRenderedOrderRefresh(local$));
		act(() => {
			jest.advanceTimersByTime(60_000);
		});
		expect(mockRequire).not.toHaveBeenCalled();
		unmount();
		const results$ = new Subject<Result>();
		renderHook(() => useRenderedOrderRefresh(results$));
		act(() => {
			results$.next({ hits: [hit(7)] });
		});
		expect(mockRequire).not.toHaveBeenCalled();
		act(() => {
			jest.advanceTimersByTime(60_000);
		});
		expect(mockRequire).toHaveBeenCalledTimes(1);
	});

	it('H5: skips ticks while the previous pass is still in flight', () => {
		const handle = pendingHandle();
		mockRequire.mockReturnValue(handle);
		const results$ = new BehaviorSubject<Result>({ hits: [hit(7)] });
		renderHook(() => useRenderedOrderRefresh(results$));
		act(() => {
			jest.advanceTimersByTime(60_000);
		});
		expect(mockRequire).toHaveBeenCalledTimes(1);
		expect(handle.release).not.toHaveBeenCalled();
	});

	it('H6: releases in-flight work and removes timers and subscriptions on unmount', async () => {
		const handle = pendingHandle();
		mockRequire.mockReturnValue(handle);
		const results$ = new BehaviorSubject<Result>({ hits: [hit(7)] });
		const { unmount } = renderHook(() => useRenderedOrderRefresh(results$));
		unmount();
		expect(handle.release).toHaveBeenCalledTimes(1);
		expect(mockListeners.size).toBe(0);
		expect(results$.observed).toBe(false);
		expect(manualSyncInFlight$.observed).toBe(false);
		expect(jest.getTimerCount()).toBe(0);
		act(() => {
			jest.advanceTimersByTime(120_000);
			manualSyncInFlight$.next(true);
		});
		appState('background');
		appState('active');
		await act(async () => {
			handle.resolve();
		});
		expect(handle.release).toHaveBeenCalledTimes(1);
		expect(mockRequire).toHaveBeenCalledTimes(1);
	});

	it('H7: fires once when manual sync turns true while active', async () => {
		const results$ = new BehaviorSubject<Result>({ hits: [hit(7)] });
		renderHook(() => useRenderedOrderRefresh(results$));
		await act(async () => {});
		act(() => {
			manualSyncInFlight$.next(true);
		});
		expect(mockRequire).toHaveBeenCalledTimes(2);
		await act(async () => {});
		act(() => {
			manualSyncInFlight$.next(true);
		});
		expect(mockRequire).toHaveBeenCalledTimes(2);
	});
});
