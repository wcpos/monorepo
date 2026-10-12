/**
 * @jest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { Observable, of, Subject } from 'rxjs';

import { createQueryHandle, type QueryHandle, type QueryResult } from '@wcpos/query';
import type { RxdbSyncEngine } from '@wcpos/sync-engine';

import { useQueryBindingFor, useQueryHandleFields, useQueryHandleView } from './query-handles';

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

describe('useQueryHandleView', () => {
	it('draws the loading state before the first answer, then the answer', () => {
		const results = new Subject<Result>();
		const handle = handleOver('a', results);
		const { result } = renderHook(() => useQueryHandleView(handle));
		expect(result.current.value.ready).toBe(false);
		act(() => results.next({ count: 1, hits: [{ id: 'p1', record: {} as never }] }));
		expect(result.current.value.ready).toBe(true);
		expect(result.current.value.count).toBe(1);
		expect(result.current.settling).toBe(false);
	});

	it('keeps the drawn rows while a changed query loads, then swaps to its answer', () => {
		const first = new Subject<Result>();
		const second = new Subject<Result>();
		const handles = { a: handleOver('a', first), b: handleOver('b', second) };
		const { result, rerender } = renderHook(({ key }) => useQueryHandleView(handles[key]), {
			initialProps: { key: 'a' as 'a' | 'b' },
		});
		act(() => first.next({ count: 1, hits: [{ id: 'p1', record: {} as never }] }));
		const drawn = result.current.value;

		rerender({ key: 'b' });
		// The new handle has not answered: the previous rows stay on screen, flagged as settling.
		expect(result.current.value).toBe(drawn);
		expect(result.current.settling).toBe(true);

		act(() => second.next({ count: 2, hits: [] }));
		expect(result.current.value.count).toBe(2);
		expect(result.current.settling).toBe(false);
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

describe('useQueryHandleView (failures)', () => {
	it('surfaces the current handle’s failure even while the previous rows are drawn', () => {
		const first = new Subject<Result>();
		const handles = {
			a: handleOver('f', first),
			b: createQueryHandle(
				engine,
				{
					key: 'g',
					result$: () => new Observable<Result>((s) => s.error(new Error('storage gone'))),
					demands: [],
					activeCollections: [],
					censusScoped: false,
					observeActive: () => of(false),
				},
				EMPTY
			),
		};
		const { result, rerender } = renderHook(({ key }) => useQueryHandleView(handles[key]), {
			initialProps: { key: 'a' as 'a' | 'b' },
		});
		act(() => first.next({ count: 1, hits: [] }));
		rerender({ key: 'b' });
		expect(result.current.value.error).toBeInstanceOf(Error);
		expect(result.current.settling).toBe(false);
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
