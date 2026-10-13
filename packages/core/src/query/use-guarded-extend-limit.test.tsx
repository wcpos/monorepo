/**
 * @jest-environment jsdom
 */
/* eslint-disable react-compiler/react-compiler */
import * as React from 'react';

import { act, render, renderHook } from '@testing-library/react';

import { QueryStateProvider, useQueryState, useQueryStateActions } from './query-state-store';
import { getPagingVerdict, useGuardedExtendLimit } from './use-guarded-extend-limit';

import type { EngineOpinion } from './use-guarded-extend-limit';

/** No declaration in flight and no opinion from the engine: the short-page rule stands. */
const NO_OPINION: EngineOpinion = { pending: false, exhausted: null };

describe('getPagingVerdict', () => {
	it.each`
		count | exhausted | pending  | expected
		${4}  | ${true}   | ${false} | ${'end'}
		${4}  | ${false}  | ${false} | ${'extend'}
		${4}  | ${null}   | ${false} | ${'end'}
		${10} | ${true}   | ${false} | ${'extend'}
		${10} | ${false}  | ${false} | ${'extend'}
		${10} | ${null}   | ${false} | ${'extend'}
		${13} | ${true}   | ${false} | ${'extend'}
		${13} | ${false}  | ${false} | ${'extend'}
		${13} | ${null}   | ${false} | ${'extend'}
		${4}  | ${true}   | ${true}  | ${'pending'}
		${4}  | ${false}  | ${true}  | ${'pending'}
		${4}  | ${null}   | ${true}  | ${'pending'}
		${10} | ${true}   | ${true}  | ${'pending'}
		${10} | ${false}  | ${true}  | ${'pending'}
		${10} | ${null}   | ${true}  | ${'pending'}
		${13} | ${true}   | ${true}  | ${'pending'}
		${13} | ${false}  | ${true}  | ${'pending'}
		${13} | ${null}   | ${true}  | ${'pending'}
		${0}  | ${true}   | ${false} | ${'end'}
		${0}  | ${false}  | ${false} | ${'extend'}
		${0}  | ${null}   | ${false} | ${'end'}
		${0}  | ${true}   | ${true}  | ${'pending'}
		${0}  | ${false}  | ${true}  | ${'pending'}
		${0}  | ${null}   | ${true}  | ${'pending'}
	`(
		'count=$count limit=10 exhausted=$exhausted pending=$pending',
		({ count, exhausted, pending, expected }) => {
			expect(getPagingVerdict({ hitCount: count, limit: 10, pending, exhausted })).toEqual(
				expected
			);
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

	it('retains the callback for unchanged primitives and a recreated opinion object', () => {
		const extendLimit = jest.fn();
		const engine: EngineOpinion = { pending: false, exhausted: true };
		const { result, rerender } = renderHook(
			(props) => useGuardedExtendLimit(extendLimit, 10, props.engine),
			{ initialProps: { engine }, wrapper }
		);
		const initial = result.current;
		rerender({ engine });
		expect(result.current).toBe(initial);
		rerender({ engine: { ...engine } });
		expect(result.current).toBe(initial);
	});

	it('re-arms a pending empty search when it settles and extends once', () => {
		const extendLimit = jest.fn();
		const { result, rerender } = renderHook(
			(props) => useGuardedExtendLimit(extendLimit, 0, props.engine),
			{ initialProps: { engine: { pending: true, exhausted: false } as EngineOpinion }, wrapper }
		);
		const pending = result.current;
		act(() => pending());
		expect(extendLimit).not.toHaveBeenCalled();
		rerender({ engine: { pending: false, exhausted: false } });
		expect(result.current).not.toBe(pending);
		act(() => {
			result.current();
			result.current();
		});
		expect(extendLimit).toHaveBeenCalledTimes(1);
	});

	it('changes identity from full to overfull even when permission is unchanged', () => {
		const extendLimit = jest.fn();
		const engine: EngineOpinion = { pending: false, exhausted: true };
		const { result, rerender } = renderHook(
			({ count }) => useGuardedExtendLimit(extendLimit, count, engine),
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
	function Probe({
		resultCount,
		engine = NO_OPINION,
	}: {
		resultCount: number;
		engine?: EngineOpinion;
	}) {
		limit = useQueryState<'products', number>((state) => state.limit);
		const actions = useQueryStateActions<'products'>();
		fire = useGuardedExtendLimit(actions.extendLimit, resultCount, engine);
		return null;
	}

	function probeTree(resultCount: number, engine?: EngineOpinion) {
		return (
			<QueryStateProvider
				collection="products"
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
			>
				<Probe resultCount={resultCount} engine={engine} />
			</QueryStateProvider>
		);
	}

	function renderProbe(resultCount: number, engine?: EngineOpinion) {
		return render(probeTree(resultCount, engine));
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
		view.rerender(probeTree(20));
		act(() => fire!());
		expect(limit).toBe(30);
	});

	it('extends a short local result when the engine says more may exist', () => {
		renderProbe(4, { pending: false, exhausted: false });
		act(() => fire!());
		expect(limit).toBe(20);
	});

	it('does not extend a short read when the engine says the search is exhausted', () => {
		renderProbe(4, { pending: false, exhausted: true });
		act(() => fire!());
		expect(limit).toBe(10);
	});

	it('extends a FULL read past an exhausted lane, then stops once the read comes back short', () => {
		// The walk over-fetches a dial-sized page and persists every row, so a complete lane can
		// hold more than the limit: 13 hits on a limit-10 screen read as exhausted while three
		// resident rows sat past the clip (1.10.14 Products page, 2026-09-15).
		const view = renderProbe(10, { pending: false, exhausted: true });
		act(() => fire!());
		expect(limit).toBe(20);

		view.rerender(probeTree(13, { pending: false, exhausted: true }));
		act(() => fire!());
		act(() => fire!());
		expect(limit).toBe(20);
	});

	it('waits for a pending extension to settle before extending again', () => {
		const view = renderProbe(10, { pending: true, exhausted: false });
		act(() => fire!());
		expect(limit).toBe(10);

		view.rerender(probeTree(10, { pending: false, exhausted: false }));
		act(() => fire!());
		expect(limit).toBe(20);
	});

	it('keeps the short-page heuristic when the engine has no opinion', () => {
		renderProbe(4, { pending: false, exhausted: null });
		act(() => fire!());
		expect(limit).toBe(10);
	});
});
