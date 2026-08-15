/**
 * @jest-environment jsdom
 */
/* eslint-disable react-compiler/react-compiler */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { QueryStateProvider, useQueryState, useQueryStateActions } from './query-state-store';
import { useGuardedExtendLimit } from './use-guarded-extend-limit';

describe('useGuardedExtendLimit (#1221)', () => {
	let fire: (() => void) | undefined;
	let limit: number | undefined;

	function Probe({ resultCount }: { resultCount: number }) {
		limit = useQueryState<'products', number>((state) => state.limit);
		const actions = useQueryStateActions<'products'>();
		fire = useGuardedExtendLimit(actions.extendLimit, resultCount);
		return null;
	}

	function renderProbe(resultCount: number) {
		return render(
			<QueryStateProvider
				collection="products"
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
			>
				<Probe resultCount={resultCount} />
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
});
