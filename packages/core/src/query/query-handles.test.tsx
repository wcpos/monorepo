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

import { useDrawnHandle, useQueryHandleFields, useQuerySnapshot } from './query-handles';

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

describe('useQuerySnapshot with useDeferredValue(handle)', () => {
	it('keeps the previous handle’s rows while the new one suspends, and only its read', async () => {
		const first = new Subject<Result>();
		const second = new Subject<Result>();
		let demandA = 0;
		let demandB = 0;
		const withDemand = (key: string, results: Subject<Result>, count: () => void) =>
			createQueryHandle(
				engine,
				{
					key,
					result$: () => results,
					demands: [
						{
							collection: 'products',
							coverageTarget$: of(null),
							searchLane$: of(null),
							pending$: of(false),
							fetched$: of(false),
							whenReady: async () => ({ attempted: true, fetched: false }),
							declareOnce: async () => ({ attempted: true, fetched: false }),
							sync: async () => undefined,
							start: count,
							stop: () => undefined,
						},
					],
					activeCollections: [],
					censusScoped: false,
					observeActive: () => of(false),
				},
				EMPTY
			);
		const handles = {
			a: withDemand('switch-a', first, () => (demandA += 1)),
			b: withDemand('switch-b', second, () => (demandB += 1)),
		};
		// The owner: retains the live handle from an effect above the boundary, as the screens do.
		function Owner({ which }: { which: 'a' | 'b' }) {
			const handle = handles[which];
			React.useEffect(() => handle.retain(), [handle]);
			return (
				<React.Suspense fallback={<span data-testid="fallback" />}>
					<Reader handle={handle} />
				</React.Suspense>
			);
		}
		function Reader({ handle }: { handle: QueryHandle<Result> }) {
			const shown = React.useDeferredValue(handle);
			const snapshot = useQuerySnapshot(shown);
			return (
				<span data-testid="rows">
					{snapshot.count}:{shown === handle ? 'settled' : 'settling'}
				</span>
			);
		}
		const { rerender } = render(<Owner which="a" />);
		expect(screen.getByTestId('fallback')).toBeTruthy();
		await act(async () => first.next({ count: 1, hits: [] }));
		expect(screen.getByTestId('rows').textContent).toBe('1:settled');
		expect(demandA).toBe(1);

		rerender(<Owner which="b" />);
		await act(async () => undefined);
		// B suspends; A's rows stay on screen, flagged as settling. A's demand is gone with its
		// owner (B declared first), A's read stays for the reader.
		expect(screen.getByTestId('rows').textContent).toBe('1:settling');
		expect(demandB).toBe(1);
		expect(handles.a.value.pending).toBe(false);

		await act(async () => second.next({ count: 2, hits: [] }));
		expect(screen.getByTestId('rows').textContent).toBe('2:settled');
	});
});

describe('useDrawnHandle', () => {
	it('moves the reader onto the live handle when the superseded one fails, instead of the boundary', async () => {
		const first = new Subject<Result>();
		const second = new Subject<Result>();
		const handles = { a: handleOver('drawn-a', first), b: handleOver('drawn-b', second) };
		function Owner({ which }: { which: 'a' | 'b' }) {
			const handle = handles[which];
			React.useEffect(() => handle.retain(), [handle]);
			return (
				<ErrorBoundary fallbackRender={() => <span data-testid="failed" />} resetKeys={[handle]}>
					<React.Suspense fallback={<span data-testid="fallback" />}>
						<Reader handle={handle} />
					</React.Suspense>
				</ErrorBoundary>
			);
		}
		function Reader({ handle }: { handle: QueryHandle<Result> }) {
			const shown = useDrawnHandle(handle);
			const snapshot = useQuerySnapshot(shown);
			return <span data-testid="rows">{snapshot.count}</span>;
		}
		const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
		try {
			const { rerender } = render(<Owner which="a" />);
			await act(async () => first.next({ count: 1, hits: [] }));
			expect(screen.getByTestId('rows').textContent).toBe('1');
			rerender(<Owner which="b" />);
			await act(async () => undefined);
			// A's rows stay while B answers.
			expect(screen.getByTestId('rows').textContent).toBe('1');
			// A's read fails in that window: not the boundary (its keys already moved on to B,
			// so nothing would ever clear it); the reader waits on B instead.
			await act(async () => first.error(new Error('storage gone')));
			expect(screen.queryByTestId('failed')).toBeNull();
			expect(screen.getByTestId('fallback')).toBeTruthy();
			await act(async () => second.next({ count: 2, hits: [] }));
			expect(screen.getByTestId('rows').textContent).toBe('2');
		} finally {
			consoleError.mockRestore();
		}
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
