/**
 * @jest-environment jsdom
 */
/* eslint-disable react-compiler/react-compiler */
import * as React from 'react';

import { act, render, renderHook } from '@testing-library/react';
import { BehaviorSubject, of } from 'rxjs';

import { QueryStateProvider, useQueryState, useQueryStateActions } from './query-state-store';
import { getPagingVerdict, useGuardedExtendLimit } from './use-guarded-extend-limit';

import type { QueryBinding } from './query-bindings';

describe('getPagingVerdict', () => {
	it.each`
		count | exhausted | pending  | expected
		${4}  | ${true}   | ${false} | ${{ mayExtend: false, atEnd: true, reason: 'short-read' }}
		${4}  | ${false}  | ${false} | ${{ mayExtend: true, atEnd: false, reason: 'more-possible' }}
		${4}  | ${null}   | ${false} | ${{ mayExtend: false, atEnd: true, reason: 'short-read' }}
		${10} | ${true}   | ${false} | ${{ mayExtend: true, atEnd: false, reason: 'full-window' }}
		${10} | ${false}  | ${false} | ${{ mayExtend: true, atEnd: false, reason: 'full-window' }}
		${10} | ${null}   | ${false} | ${{ mayExtend: true, atEnd: false, reason: 'full-window' }}
		${13} | ${true}   | ${false} | ${{ mayExtend: true, atEnd: false, reason: 'full-window' }}
		${13} | ${false}  | ${false} | ${{ mayExtend: true, atEnd: false, reason: 'full-window' }}
		${13} | ${null}   | ${false} | ${{ mayExtend: true, atEnd: false, reason: 'full-window' }}
		${4}  | ${true}   | ${true}  | ${{ mayExtend: false, atEnd: false, reason: 'pending' }}
		${4}  | ${false}  | ${true}  | ${{ mayExtend: false, atEnd: false, reason: 'pending' }}
		${4}  | ${null}   | ${true}  | ${{ mayExtend: false, atEnd: false, reason: 'pending' }}
		${10} | ${true}   | ${true}  | ${{ mayExtend: false, atEnd: false, reason: 'pending' }}
		${10} | ${false}  | ${true}  | ${{ mayExtend: false, atEnd: false, reason: 'pending' }}
		${10} | ${null}   | ${true}  | ${{ mayExtend: false, atEnd: false, reason: 'pending' }}
		${13} | ${true}   | ${true}  | ${{ mayExtend: false, atEnd: false, reason: 'pending' }}
		${13} | ${false}  | ${true}  | ${{ mayExtend: false, atEnd: false, reason: 'pending' }}
		${13} | ${null}   | ${true}  | ${{ mayExtend: false, atEnd: false, reason: 'pending' }}
		${0}  | ${true}   | ${false} | ${{ mayExtend: false, atEnd: true, reason: 'short-read' }}
		${0}  | ${false}  | ${false} | ${{ mayExtend: true, atEnd: false, reason: 'more-possible' }}
		${0}  | ${null}   | ${false} | ${{ mayExtend: false, atEnd: true, reason: 'short-read' }}
		${0}  | ${true}   | ${true}  | ${{ mayExtend: false, atEnd: false, reason: 'pending' }}
		${0}  | ${false}  | ${true}  | ${{ mayExtend: false, atEnd: false, reason: 'pending' }}
		${0}  | ${null}   | ${true}  | ${{ mayExtend: false, atEnd: false, reason: 'pending' }}
	`(
		'count=$count limit=10 exhausted=$exhausted pending=$pending',
		({ count, exhausted, pending, expected }) => {
			expect(getPagingVerdict(count, 10, pending, exhausted)).toEqual(expected);
		}
	);
});

describe('paging callback identity', () => {
	function wrapper({ children }: { children: React.ReactNode }) {
		return (
			<QueryStateProvider
				collection="products"
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
			>
				{children}
			</QueryStateProvider>
		);
	}

	it('retains the callback for unchanged primitives and a recreated binding wrapper', () => {
		const extendLimit = jest.fn();
		const binding = { pending$: of(false), exhausted$: of(true) };
		const { result, rerender } = renderHook(
			(props) => useGuardedExtendLimit(extendLimit, 10, props.binding),
			{ initialProps: { binding }, wrapper }
		);
		const initial = result.current;
		rerender({ binding });
		expect(result.current).toBe(initial);
		rerender({ binding: { ...binding } });
		expect(result.current).toBe(initial);
	});

	it('re-arms a pending empty search when it settles and extends once', () => {
		const extendLimit = jest.fn();
		const pending$ = new BehaviorSubject(true);
		const binding = { pending$, exhausted$: of(false) };
		const { result } = renderHook(() => useGuardedExtendLimit(extendLimit, 0, binding), {
			wrapper,
		});
		const pending = result.current;
		act(() => pending());
		expect(extendLimit).not.toHaveBeenCalled();
		act(() => pending$.next(false));
		expect(result.current).not.toBe(pending);
		act(() => {
			result.current();
			result.current();
		});
		expect(extendLimit).toHaveBeenCalledTimes(1);
	});

	it('changes identity from full to overfull even when permission is unchanged', () => {
		const extendLimit = jest.fn();
		const binding = { pending$: of(false), exhausted$: of(true) };
		const { result, rerender } = renderHook(
			({ count }) => useGuardedExtendLimit(extendLimit, count, binding),
			{ initialProps: { count: 10 }, wrapper }
		);
		const full = result.current;
		rerender({ count: 13 });
		expect(result.current).not.toBe(full);
		act(() => result.current());
		expect(extendLimit).toHaveBeenCalledTimes(1);
	});
});

describe('useGuardedExtendLimit (#1221)', () => {
	let fire: (() => void) | undefined;
	let limit: number | undefined;
	type EngineBinding = Pick<QueryBinding, 'pending$' | 'exhausted$'>;

	function Probe({ resultCount, binding }: { resultCount: number; binding?: EngineBinding }) {
		limit = useQueryState<'products', number>((state) => state.limit);
		const actions = useQueryStateActions<'products'>();
		fire = useGuardedExtendLimit(actions.extendLimit, resultCount, binding);
		return null;
	}

	function renderProbe(resultCount: number, binding?: EngineBinding) {
		return render(
			<QueryStateProvider
				collection="products"
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
			>
				<Probe resultCount={resultCount} binding={binding} />
			</QueryStateProvider>
		);
	}

	afterEach(() => {
		fire = undefined;
		limit = undefined;
	});

	it('never extends past a short page — a result below the limit is the true end', () => {
		renderProbe(4);
		act(() => fire!());
		act(() => fire!());
		act(() => fire!());
		expect(limit).toBe(10);
	});

	it('never extends an empty result — the storm case: a no-match search stays at one page', () => {
		renderProbe(0);
		act(() => fire!());
		expect(limit).toBe(10);
	});

	it('extends only once when end-reached fires repeatedly in one React batch', () => {
		renderProbe(10);
		act(() => {
			fire!();
			fire!();
			fire!();
		});
		expect(limit).toBe(20);
	});

	it('extends a full page once, then blocks until the extension lands', () => {
		const view = renderProbe(10);
		act(() => fire!());
		expect(limit).toBe(20);

		// End-reached churn while the wider fetch is outstanding must not extend again.
		act(() => fire!());
		act(() => fire!());
		expect(limit).toBe(20);

		// The fetch lands a full window: the next end-reached extends again.
		view.rerender(
			<QueryStateProvider
				collection="products"
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
			>
				<Probe resultCount={20} />
			</QueryStateProvider>
		);
		act(() => fire!());
		expect(limit).toBe(30);
	});

	it('extends a short local result when the engine says more may exist', () => {
		renderProbe(4, { pending$: of(false), exhausted$: of(false) });
		act(() => fire!());
		expect(limit).toBe(20);
	});

	it('does not extend a short read when the engine says the search is exhausted', () => {
		renderProbe(4, { pending$: of(false), exhausted$: of(true) });
		act(() => fire!());
		expect(limit).toBe(10);
	});

	it('extends a FULL read past an exhausted lane, then stops once the read comes back short', () => {
		// The walk over-fetches a dial-sized page and persists every row, so a complete lane can
		// hold more than the limit: 13 hits on a limit-10 screen read as exhausted while three
		// resident rows sat past the clip (1.10.14 Products page, 2026-09-15).
		const view = renderProbe(10, { pending$: of(false), exhausted$: of(true) });
		act(() => fire!());
		expect(limit).toBe(20);

		view.rerender(
			<QueryStateProvider
				collection="products"
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
			>
				<Probe resultCount={13} binding={{ pending$: of(false), exhausted$: of(true) }} />
			</QueryStateProvider>
		);
		act(() => fire!());
		act(() => fire!());
		expect(limit).toBe(20);
	});

	it('waits for a pending extension to settle before extending again', () => {
		const pending$ = new BehaviorSubject(true);
		renderProbe(10, { pending$, exhausted$: of(false) });
		act(() => fire!());
		expect(limit).toBe(10);

		act(() => pending$.next(false));
		act(() => fire!());
		expect(limit).toBe(20);
	});

	it('keeps the short-page heuristic when the engine has no opinion', () => {
		renderProbe(4, { pending$: of(false), exhausted$: of(null) });
		act(() => fire!());
		expect(limit).toBe(10);
	});
});
