/**
 * @jest-environment jsdom
 */
/* eslint-disable react-compiler/react-compiler */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { QueryStateProvider, useQueryState, useQueryStateActions } from './query-state-store';

import type { QueryStateActions, QueryStateOf } from './query-state-types';

describe('QueryStateProvider', () => {
	function wrapper(children: React.ReactNode) {
		return (
			<QueryStateProvider
				collection="products"
				initialPageSize={20}
				initialSort={{ field: 'name', direction: 'asc' }}
			>
				{children}
			</QueryStateProvider>
		);
	}

	it('only re-renders subscribers whose selected slice changed', () => {
		let actions: QueryStateActions<'products'> | undefined;
		let searchRenders = 0;
		let filterRenders = 0;

		function SearchSubscriber() {
			useQueryState<'products', string>((state) => state.search);
			searchRenders += 1;
			return null;
		}

		function FilterSubscriber() {
			useQueryState<'products', number[]>((state) => state.filters.categories);
			filterRenders += 1;
			return null;
		}

		function ActionsSubscriber() {
			actions = useQueryStateActions<'products'>();
			return null;
		}

		render(
			wrapper(
				<>
					<SearchSubscriber />
					<FilterSubscriber />
					<ActionsSubscriber />
				</>
			)
		);
		act(() => actions?.setSearch('coffee'));

		expect(searchRenders).toBe(2);
		expect(filterRenders).toBe(1);
	});

	it('publishes a changed result key and reset window atomically', () => {
		let actions: QueryStateActions<'products'> | undefined;
		const observed: QueryStateOf<'products'>[] = [];

		function Subscriber() {
			observed.push(useQueryState<'products'>());
			actions = useQueryStateActions<'products'>();
			return null;
		}

		render(wrapper(<Subscriber />));
		act(() => actions?.extendLimit());
		act(() => actions?.setSearch('tea'));

		expect(observed.at(-1)).toMatchObject({ search: 'tea', limit: 20 });
		expect(observed).not.toContainEqual(expect.objectContaining({ search: 'tea', limit: 40 }));
	});

	it('implements narrow filter, search, sort, reset, and paging actions', () => {
		let actions: QueryStateActions<'products'> | undefined;
		let state: QueryStateOf<'products'> | undefined;

		function Subscriber() {
			state = useQueryState<'products'>();
			actions = useQueryStateActions<'products'>();
			return null;
		}

		render(wrapper(<Subscriber />));
		act(() => actions?.setFilter('categories', [2, 7]));
		expect(state).toMatchObject({ filters: { categories: [2, 7] }, limit: 20 });

		act(() => actions?.extendLimit());
		expect(state?.limit).toBe(40);
		act(() => actions?.clearFilter('categories'));
		expect(state).toMatchObject({ filters: { categories: [] }, limit: 20 });

		act(() => actions?.setSearch('coffee'));
		act(() => actions?.clearSearch());
		expect(state?.search).toBe('');

		act(() => actions?.setFilter('featured', true));
		act(() => actions?.setFilter('on_sale', true));
		act(() => actions?.resetFilters());
		expect(state?.filters).toEqual({ categories: [], tags: [], brands: [] });

		act(() => actions?.extendLimit());
		act(() => actions?.setSort('price', 'desc'));
		expect(state).toMatchObject({ sort: { field: 'price', direction: 'desc' }, limit: 20 });
	});

	it('does not reset the window when an action commits the existing value', () => {
		let actions: QueryStateActions<'products'> | undefined;
		let state: QueryStateOf<'products'> | undefined;
		function Subscriber() {
			state = useQueryState<'products'>();
			actions = useQueryStateActions<'products'>();
			return null;
		}

		render(wrapper(<Subscriber />));
		act(() => actions?.extendLimit());
		act(() => actions?.setSearch(''));
		act(() => actions?.setFilter('categories', []));
		act(() => actions?.setSort('name', 'asc'));

		expect(state?.limit).toBe(40);
	});
});
