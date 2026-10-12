/**
 * @jest-environment jsdom
 */

import * as React from 'react';

import { act, render, renderHook, screen } from '@testing-library/react';
import { ErrorBoundary } from 'react-error-boundary';
import { Observable, of, Subject } from 'rxjs';

import {
	createQueryHandle,
	type QueryHandle,
	type QueryResult,
	type QuerySnapshot,
} from '@wcpos/query';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { useQueryBindingFor, useQueryHandleFields, useQuerySnapshot } from './query-handles';

import type { RxCollection } from 'rxdb';

type Result = QueryResult<RxCollection>;
const EMPTY: Result = { count: 0, hits: [] };
// No demands, no census, no activity: the engine is never called.
const engine = {} as RxdbSyncEngine;

function handleOver(key: string, results: Subject<Result>): QueryHandle<Result> {
	return createQueryHandle(
		engine,
		{
			key,
			result$: () => results,
			demands: [],
			activeCollections: [],
			censusScoped: false,
			observeActive: () => of(false),
		},
		EMPTY
	);
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('useQuerySnapshot', () => {
	function Reader({
		handle,
		onRender,
	}: {
		handle: QueryHandle<Result>;
		onRender: (snapshot: QuerySnapshot<Result>) => void;
	}) {
		const snapshot = useQuerySnapshot(handle);
		onRender(snapshot);
		return <span data-testid="count">{snapshot.count}</span>;
	}

	it('suspends until the handle answers, then renders the answer', async () => {
		const results = new Subject<Result>();
		const handle = handleOver('a', results);
		const seen: QuerySnapshot<Result>[] = [];
		render(
			<React.Suspense fallback={<span data-testid="fallback" />}>
				<Reader handle={handle} onRender={(snapshot) => seen.push(snapshot)} />
			</React.Suspense>
		);
		expect(screen.getByTestId('fallback')).toBeTruthy();
		expect(seen).toHaveLength(0);
		// The owner retains; the reader cannot (it never committed).
		const leave = handle.subscribe(() => undefined);
		// The answer settles the thrown promise; React retries the reader on the next tick.
		await act(async () => results.next({ count: 1, hits: [{ id: 'p1', record: {} as never }] }));
		expect(screen.getByTestId('count').textContent).toBe('1');
		expect(seen.at(-1)?.ready).toBe(true);
		leave();
	});

	it('throws a failed read to the boundary, and a reset retries through the owner', async () => {
		let attempts = 0;
		const late = new Subject<Result>();
		const handle = createQueryHandle(
			engine,
			{
				key: 'fail',
				result$: () =>
					new Observable<Result>((subscriber) => {
						attempts += 1;
						if (attempts === 1) subscriber.error(new Error('storage gone'));
						else late.subscribe(subscriber);
					}),
				demands: [],
				activeCollections: [],
				censusScoped: false,
				observeActive: () => of(false),
			},
			EMPTY
		);
		const leave = handle.subscribe(() => undefined);
		expect(handle.value.error).toBeInstanceOf(Error);
		const silence = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		// The production wiring: the screen's boundary resets by asking the handle again.
		render(
			<ErrorBoundary
				fallbackRender={({ resetErrorBoundary }) => (
					<button data-testid="reset" onClick={resetErrorBoundary} />
				)}
				onReset={() => handle.retry()}
			>
				<React.Suspense fallback={<span data-testid="fallback" />}>
					<Reader handle={handle} onRender={() => undefined} />
				</React.Suspense>
			</ErrorBoundary>
		);
		expect(screen.getByTestId('reset')).toBeTruthy();
		act(() => screen.getByTestId('reset').click());
		// The retry is in flight: the reader suspends on it rather than rethrowing the failure.
		expect(screen.getByTestId('fallback')).toBeTruthy();
		expect(attempts).toBe(2);
		await act(async () => late.next({ count: 4, hits: [] }));
		expect(screen.getByTestId('count').textContent).toBe('4');
		silence.mockRestore();
		leave();
	});
});

describe('useQueryHandleFields', () => {
	it('holds its snapshot while only an unwatched field moves, and follows a watched one', () => {
		const results = new Subject<Result>();
		const active = new Subject<boolean>();
		const handle = createQueryHandle(
			engine,
			{
				key: 'fields',
				result$: () => results,
				demands: [],
				activeCollections: ['products'],
				censusScoped: false,
				observeActive: () => active,
			},
			EMPTY
		);
		let renders = 0;
		const { result } = renderHook(() => {
			renders += 1;
			return useQueryHandleFields(handle, ['pending']);
		});
		act(() => results.next({ count: 1, hits: [] }));
		const answered = result.current;
		const rendersAfterAnswer = renders;
		// The sync spinner flips `active`: this reader does not move.
		act(() => active.next(true));
		expect(result.current).toBe(answered);
		expect(renders).toBe(rendersAfterAnswer);
		expect(handle.value.active).toBe(true);
		// A new answer always reaches it.
		act(() => results.next({ count: 2, hits: [] }));
		expect(result.current.count).toBe(2);
		expect(result.current.active).toBe(true);
	});
});

describe('useQueryBindingFor', () => {
	it('builds the resource on first access only, and its identity is the handle’s', () => {
		const results = new Subject<Result>();
		const handle = handleOver('c', results);
		let started = 0;
		const original = handle.subscribe;
		handle.subscribe = (listener) => {
			started += 1;
			return original(listener);
		};
		const { result, rerender } = renderHook(() => useQueryBindingFor(handle));
		const binding = result.current;
		rerender();
		expect(result.current).toBe(binding);
		// Nothing subscribed the handle: no reader has asked for the resource yet.
		expect(started).toBe(0);
		expect(binding.resource).toBe(binding.resource);
		expect(binding.sync).toBe(handle.sync);
	});

	it('follows the handle when it changes, keeping one resource, and lets go on unmount', async () => {
		const first = new Subject<Result>();
		const second = new Subject<Result>();
		const handles = { a: handleOver('d', first), b: handleOver('e', second) };
		const { result, rerender, unmount } = renderHook(
			({ key }) => useQueryBindingFor(handles[key]),
			{
				initialProps: { key: 'a' as 'a' | 'b' },
			}
		);
		const resource = result.current.resource;
		act(() => first.next({ count: 1, hits: [] }));
		expect(resource.read().count).toBe(1);

		rerender({ key: 'b' });
		await settle();
		// The same resource now follows the second handle; it kept the rows it had.
		expect(result.current.resource).toBe(resource);
		expect(resource.read().count).toBe(1);
		act(() => second.next({ count: 2, hits: [] }));
		expect(resource.read().count).toBe(2);

		unmount();
		await settle();
		expect(resource.isDestroyed).toBe(true);
	});
});
