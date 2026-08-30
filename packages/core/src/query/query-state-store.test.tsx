/**
 * @jest-environment jsdom
 */
/* eslint-disable react-compiler/react-compiler */
import * as React from 'react';

import { act, render } from '@testing-library/react';

import { QueryStateProvider, useQueryState, useQueryStateActions } from './query-state-store';
import { compileQuery } from './query-state-translator';

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

	function renderProbe() {
		let actions: QueryStateActions<'products'> | undefined;
		let state: QueryStateOf<'products'> | undefined;
		let renders = 0;

		function Probe() {
			state = useQueryState<'products'>();
			actions = useQueryStateActions<'products'>();
			renders += 1;
			return null;
		}

		render(wrapper(<Probe />));
		if (!actions) throw new Error('Query-state actions were not captured');
		return { actions, getState: () => state, getRenders: () => renders };
	}

	it('raises a smaller result window to a new page size', () => {
		const probe = renderProbe();

		act(() => probe.actions.setPageSize(30));

		expect(probe.getState()?.limit).toBe(30);
	});

	it('leaves a larger result window unchanged when the page size changes', () => {
		const probe = renderProbe();
		act(() => probe.actions.extendLimit());
		const renders = probe.getRenders();

		act(() => probe.actions.setPageSize(30));

		expect(probe.getState()?.limit).toBe(40);
		expect(probe.getRenders()).toBe(renders);
	});

	it('uses the changed page size for extensions and result resets', () => {
		const probe = renderProbe();
		act(() => probe.actions.setPageSize(30));

		act(() => probe.actions.extendLimit());
		expect(probe.getState()?.limit).toBe(60);

		act(() => probe.actions.setSearch('tea'));
		expect(probe.getState()).toMatchObject({ search: 'tea', limit: 30 });
	});

	it('does not publish when the page size is unchanged', () => {
		const probe = renderProbe();
		const renders = probe.getRenders();

		act(() => probe.actions.setPageSize(20));

		expect(probe.getRenders()).toBe(renders);
	});

	it('rejects page sizes that are not positive integers', () => {
		const { actions } = renderProbe();

		expect(() => actions.setPageSize(0)).toThrow('pageSize must be a positive integer');
		expect(() => actions.setPageSize(2.5)).toThrow('pageSize must be a positive integer');
	});

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

	it('caches object selector snapshots until the selected slice changes', () => {
		let actions: QueryStateActions<'products'> | undefined;
		let selected: { search: string } | undefined;
		let renders = 0;

		function ObjectSubscriber() {
			selected = useQueryState<'products', { search: string }>((state) => ({
				search: state.search,
			}));
			renders += 1;
			return null;
		}

		function ActionsSubscriber() {
			actions = useQueryStateActions<'products'>();
			return null;
		}

		render(
			wrapper(
				<>
					<ObjectSubscriber />
					<ActionsSubscriber />
				</>
			)
		);
		expect(renders).toBe(1);

		act(() => actions?.setFilter('featured', true));
		expect(renders).toBe(1);

		act(() => actions?.setSearch('coffee'));
		expect(renders).toBe(2);
		expect(selected).toEqual({ search: 'coffee' });
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
		expect(state).toMatchObject({
			sort: { field: 'price', direction: 'desc' },
			limit: 20,
		});
	});

	it('replaces a keyed filter with the latest value', () => {
		let actions: QueryStateActions<'products'> | undefined;
		let state: QueryStateOf<'products'> | undefined;

		function Subscriber() {
			state = useQueryState<'products'>();
			actions = useQueryStateActions<'products'>();
			return null;
		}

		render(wrapper(<Subscriber />));
		act(() => actions?.setFilter('stock_status', 'instock'));
		act(() => actions?.setFilter('stock_status', 'outofstock'));

		expect(state?.filters).toEqual({
			categories: [],
			tags: [],
			brands: [],
			stock_status: 'outofstock',
		});
	});

	it('treats clearing an absent filter as a harmless no-op', () => {
		let actions: QueryStateActions<'products'> | undefined;
		let state: QueryStateOf<'products'> | undefined;

		function Subscriber() {
			state = useQueryState<'products'>();
			actions = useQueryStateActions<'products'>();
			return null;
		}

		render(wrapper(<Subscriber />));
		act(() => actions?.extendLimit());
		const beforeClear = state;
		act(() => actions?.clearFilter('stock_status'));

		expect(state).toBe(beforeClear);
		expect(state).toMatchObject({
			filters: { categories: [], tags: [], brands: [] },
			limit: 40,
		});
	});

	it('replaces a cashier selection in both the selector and order demand', () => {
		let actions: QueryStateActions<'orders'> | undefined;
		let state: QueryStateOf<'orders'> | undefined;

		function Subscriber() {
			state = useQueryState<'orders'>();
			actions = useQueryStateActions<'orders'>();
			return null;
		}

		render(
			<QueryStateProvider
				collection="orders"
				initialPageSize={20}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			>
				<Subscriber />
			</QueryStateProvider>
		);
		act(() => actions?.setFilter('cashier', 7));
		act(() => actions?.setFilter('cashier', 8));

		expect(state?.filters).toEqual({ cashier: 8 });
		const compiled = compileQuery('orders', state!, { id: 'orders' });
		expect({
			requirements: compiled.demand,
			represented: compiled.represented,
		}).toEqual({
			requirements: [
				{
					id: 'orders:orders-browse',
					collection: 'orders',
					kind: 'orders-browse',
					cashierId: 8,
					limit: 20,
					orderby: 'date',
					order: 'desc',
					priority: 700,
				},
			],
			represented: true,
		});
	});

	it('clears cashier without removing an active store filter', () => {
		let actions: QueryStateActions<'orders'> | undefined;
		let state: QueryStateOf<'orders'> | undefined;

		function Subscriber() {
			state = useQueryState<'orders'>();
			actions = useQueryStateActions<'orders'>();
			return null;
		}

		render(
			<QueryStateProvider
				collection="orders"
				initialPageSize={20}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			>
				<Subscriber />
			</QueryStateProvider>
		);
		act(() => actions?.setFilter('store', 12));
		act(() => actions?.setFilter('cashier', 7));
		act(() => actions?.clearFilter('cashier'));

		expect(state?.filters).toEqual({ store: 12 });
		const compiled = compileQuery('orders', state!, { id: 'orders' });
		expect(compiled.demand[0]).toEqual({
			id: 'orders:orders-browse',
			collection: 'orders',
			kind: 'orders-browse',
			store: '12',
			limit: 20,
			orderby: 'date',
			order: 'desc',
			priority: 700,
		});
	});

	it('preserves store while cashier is selected, reselected, and cleared', () => {
		let actions: QueryStateActions<'orders'> | undefined;
		let state: QueryStateOf<'orders'> | undefined;

		function Subscriber() {
			state = useQueryState<'orders'>();
			actions = useQueryStateActions<'orders'>();
			return null;
		}

		render(
			<QueryStateProvider
				collection="orders"
				initialPageSize={20}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			>
				<Subscriber />
			</QueryStateProvider>
		);
		act(() => actions?.setFilter('store', 12));
		act(() => actions?.setFilter('cashier', 7));
		expect(state?.filters).toEqual({ store: 12, cashier: 7 });

		act(() => actions?.setFilter('cashier', 8));
		expect(state?.filters).toEqual({ store: 12, cashier: 8 });

		act(() => actions?.clearFilter('cashier'));
		expect(state?.filters).toEqual({ store: 12 });
	});

	it('replaces one selected category with another in selector and demand', () => {
		let actions: QueryStateActions<'products'> | undefined;
		let state: QueryStateOf<'products'> | undefined;

		function Subscriber() {
			state = useQueryState<'products'>();
			actions = useQueryStateActions<'products'>();
			return null;
		}

		render(wrapper(<Subscriber />));
		act(() => actions?.setFilter('categories', [11]));
		act(() => actions?.setFilter('categories', [22]));

		expect(state?.filters.categories).toEqual([22]);
		const compiled = compileQuery('products', state!, { id: 'products' });
		expect(compiled.read.prefilter).toEqual({ categoryIds: { $in: [22] } });
		expect(compiled.demand[0]).toMatchObject({
			kind: 'product-browse',
			category: [22],
		});
	});

	it('fully removes replaced multi-category ids from selector and demand', () => {
		let actions: QueryStateActions<'products'> | undefined;
		let state: QueryStateOf<'products'> | undefined;

		function Subscriber() {
			state = useQueryState<'products'>();
			actions = useQueryStateActions<'products'>();
			return null;
		}

		render(wrapper(<Subscriber />));
		act(() => actions?.setFilter('categories', [11, 22]));
		act(() => actions?.setFilter('categories', [33]));

		expect(state?.filters.categories).toEqual([33]);
		const compiled = compileQuery('products', state!, { id: 'products' });
		expect(compiled.read.prefilter).toEqual({ categoryIds: { $in: [33] } });
		expect(compiled.demand[0]).toMatchObject({
			kind: 'product-browse',
			category: [33],
		});
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

	it('clears an optional filter instead of restoring its initial screen value', () => {
		let actions: QueryStateActions<'logs'> | undefined;
		let state: QueryStateOf<'logs'> | undefined;

		function Subscriber() {
			state = useQueryState<'logs'>();
			actions = useQueryStateActions<'logs'>();
			return null;
		}

		render(
			<QueryStateProvider
				collection="logs"
				initialPageSize={10}
				initialSort={{ field: 'timestamp', direction: 'desc' }}
				initialFilters={{ level: ['error', 'warn', 'info', 'success'] }}
			>
				<Subscriber />
			</QueryStateProvider>
		);

		act(() => actions?.clearFilter('level'));

		expect(state?.filters).toEqual({});
		expect(state?.limit).toBe(10);

		act(() => actions?.resetFilters());
		expect(state?.filters).toEqual({
			level: ['error', 'warn', 'info', 'success'],
		});
	});
});
