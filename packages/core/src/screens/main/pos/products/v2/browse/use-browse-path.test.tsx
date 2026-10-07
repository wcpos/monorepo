/** @jest-environment jsdom */
import { createElement, startTransition } from 'react';

import { act, render, renderHook } from '@testing-library/react';

import { PersistedStateProvider } from '../../../../../../contexts/persisted-state';
import { inOneBatch } from '../one-batch.web';
import {
	type BrowsePath,
	filtersAtBaseline,
	useBrowsePath,
	useReleaseBrowsePath,
} from './use-browse-path';

// A tiny in-memory store, so the hook is tested against real state transitions. It keeps the
// real store's shape (query-state-store.tsx): the taxonomy fields are always present, cleared to
// [] (never deleted), and resetFilters restores the device baseline — which carries
// stock_status: 'instock' when out-of-stock products are hidden.
const CLEARED = { categories: [] as number[], tags: [] as number[], brands: [] as number[] };
let mockShowOutOfStock = true;
// The products table settings' sort: a level's header sort persists here (term-table.tsx).
let mockSettingsSort = { sortBy: 'name', sortDirection: 'asc' };
const baseline = (): Record<string, unknown> => ({
	...CLEARED,
	status: 'publish',
	...(mockShowOutOfStock ? {} : { stock_status: 'instock' }),
});
// The paging step: every result change resets the window to it (the real store's resultChange).
const PAGE = 10;
let mockState = {
	search: '',
	filters: {} as Record<string, unknown>,
	sort: { field: 'name', direction: 'asc' },
	limit: PAGE,
};
const mockListeners = new Set<() => void>();
const emit = () => mockListeners.forEach((listener) => listener());
const mockActions = {
	setFilter: jest.fn((field: string, value: unknown) => {
		mockState = {
			...mockState,
			filters: { ...mockState.filters, [field]: value },
			limit: PAGE,
		};
		emit();
	}),
	clearFilter: jest.fn((field: string) => {
		const { [field]: _, ...rest } = mockState.filters;
		mockState = {
			...mockState,
			filters: field in CLEARED ? { ...rest, [field]: [] } : rest,
			limit: PAGE,
		};
		emit();
	}),
	resetFilters: jest.fn(() => {
		mockState = { ...mockState, filters: baseline(), limit: PAGE };
		emit();
	}),
	clearSearch: jest.fn(() => {
		mockState = { ...mockState, search: '', limit: PAGE };
		emit();
	}),
	setSearch: jest.fn((search: string) => {
		mockState = { ...mockState, search, limit: PAGE };
		emit();
	}),
	setSort: jest.fn((field: string, direction: 'asc' | 'desc') => {
		mockState = { ...mockState, sort: { field, direction }, limit: PAGE };
		emit();
	}),
	extendLimit: jest.fn(() => {
		mockState = { ...mockState, limit: mockState.limit + PAGE };
		emit();
	}),
	setLimit: jest.fn((limit: number) => {
		mockState = { ...mockState, limit: Math.max(limit, PAGE) };
		emit();
	}),
};
const actions = mockActions;
jest.mock('../../../../../../query', () => {
	const { useSyncExternalStore } = jest.requireActual('react');
	return {
		useQueryState: () =>
			useSyncExternalStore(
				(listener: () => void) => {
					mockListeners.add(listener);
					return () => mockListeners.delete(listener);
				},
				() => mockState
			),
		useQueryStateActions: () => mockActions,
	};
});
jest.mock('../../../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: { ...mockSettingsSort, showOutOfStock: mockShowOutOfStock },
	}),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (doc: Record<string, unknown>, read: (value: Record<string, unknown>) => unknown) =>
		read(doc),
}));

const drinks = { kind: 'term' as const, id: 1, name: 'Drinks', count: 12 };
const hot = { kind: 'term' as const, id: 2, name: 'Hot', count: 6, parent: 1 };
const breakfast = { kind: 'shortcut' as const, id: 'qf-1', name: 'Breakfast', description: '' };
const quickFilter = {
	type: 'quick',
	id: 'qf-1',
	label: 'Breakfast',
	conditions: [{ field: 'categories', value: [3] }],
};
const terms = {
	all: [drinks, hot],
	rootsOf: () => [drinks],
	childrenOf: () => [hot],
	idsFor: (term: { kind: string; id?: number }) =>
		term.id === 1 ? [1, 2] : term.id === 2 ? [2] : [],
	quickFilterFor: (term: { kind: string }) => (term.kind === 'shortcut' ? quickFilter : undefined),
};

beforeEach(() => {
	mockShowOutOfStock = true;
	mockSettingsSort = { sortBy: 'name', sortDirection: 'asc' };
	mockState = {
		search: '',
		filters: baseline(),
		sort: { field: 'name', direction: 'asc' },
		limit: PAGE,
	};
	jest.clearAllMocks();
});

// A parent paged past its first window, a child opened over it, back: `setFilter` resets the
// window to the base page, and the parent's held snapshot (large) would be replaced by the first
// page — the mounted list shrinking at its old scroll offset, the rows the cashier loaded gone.
it('back to a paged parent restores its window with its projection in one state; a fresh entry keeps the base page', () => {
	const food = { kind: 'term' as const, id: 5, name: 'Food', count: 3 };
	const seen: { depth: number; categories: unknown; limit: number }[] = [];
	const { result } = renderHook(() => {
		const browse = useBrowsePath('categories', {
			...terms,
			all: [drinks, hot, food],
			idsFor: (term: { id?: number }) => (term.id === 5 ? [5] : terms.idsFor(term as never)),
		} as never);
		seen.push({
			depth: browse.path.length,
			categories: mockState.filters.categories,
			limit: mockState.limit,
		});
		return browse;
	});
	act(() => result.current.enter(drinks));
	act(() => {
		actions.extendLimit();
		actions.extendLimit();
	});
	expect(mockState.limit).toBe(PAGE * 3);
	act(() => result.current.enter(hot));
	expect(mockState).toMatchObject({ filters: { categories: [2] }, limit: PAGE });
	seen.length = 0;
	act(() => result.current.backTo(1));
	expect(result.current.path.map((entry) => entry.term)).toEqual([drinks]);
	expect(mockState).toMatchObject({ filters: { categories: [1, 2] }, limit: PAGE * 3 });
	// Never Drinks' projection under the base page: the filter and the window land together.
	expect(
		seen.filter(({ categories, limit }) => isEqualIds(categories, [1, 2]) && limit === PAGE)
	).toEqual([]);
	// A level entered fresh is on its base page.
	act(() => result.current.enter(food, undefined, 0));
	expect(mockState).toMatchObject({ filters: { categories: [5] }, limit: PAGE });
	// …and so is the same term entered again (a new entry, never paged).
	act(() => result.current.enter(drinks, undefined, 0));
	expect(mockState).toMatchObject({ filters: { categories: [1, 2] }, limit: PAGE });
});

it('entering a term projects its id set and the path shows it; entering a child narrows', () => {
	const { result } = renderHook(() => useBrowsePath('categories', terms as never));
	act(() => result.current.enter(drinks));
	expect(actions.setFilter).toHaveBeenLastCalledWith('categories', [1, 2]);
	expect(result.current.path.map((entry) => entry.term)).toEqual([drinks]);
	act(() => result.current.enter(hot));
	expect(actions.setFilter).toHaveBeenLastCalledWith('categories', [2]);
	expect(result.current.path.map((entry) => entry.term)).toEqual([drinks, hot]);
});

it('backTo re-projects the ancestor; root clears the field', () => {
	const { result } = renderHook(() => useBrowsePath('categories', terms as never));
	act(() => {
		result.current.enter(drinks);
		result.current.enter(hot);
	});
	act(() => result.current.backTo(1));
	expect(actions.setFilter).toHaveBeenLastCalledWith('categories', [1, 2]);
	expect(result.current.path.length).toBe(1);
	act(() => result.current.root());
	expect(actions.clearFilter).toHaveBeenLastCalledWith('categories');
	expect(result.current.path).toEqual([]);
});

it('a search drops the path; clearing the search shows the root again, not the term', () => {
	const { result } = renderHook(() => useBrowsePath('categories', terms as never));
	act(() => result.current.enter(drinks));
	act(() => actions.setSearch('lat'));
	expect(result.current.path).toEqual([]);
	expect(actions.clearFilter).toHaveBeenLastCalledWith('categories');
	act(() => actions.clearSearch());
	expect(result.current.path).toEqual([]);
});

it('a filter-bar change to the taxonomy drops the path', () => {
	const { result } = renderHook(() => useBrowsePath('categories', terms as never));
	act(() => result.current.enter(drinks));
	act(() => actions.setFilter('categories', [9]));
	expect(result.current.path).toEqual([]);
});

it('All products clears a pill on the source taxonomy so it opens, and is shown while the field stays clear', () => {
	mockState = { ...mockState, filters: { ...mockState.filters, categories: [9] } };
	const { result } = renderHook(() => useBrowsePath('categories', terms as never));
	act(() => result.current.enter({ kind: 'all' }));
	expect(actions.clearFilter).toHaveBeenLastCalledWith('categories');
	expect(result.current.path.map((entry) => entry.term)).toEqual([{ kind: 'all' }]);
	act(() => actions.setFilter('categories', [9]));
	expect(result.current.path).toEqual([]);
});

it('a Brand pill or a sort under All products keeps the level: it is All products, narrowed', () => {
	const { result } = renderHook(() => useBrowsePath('categories', terms as never));
	act(() => result.current.enter({ kind: 'all' }));
	act(() => actions.setSort('sortable_price', 'desc'));
	expect(result.current.path.map((entry) => entry.term)).toEqual([{ kind: 'all' }]);
	act(() => actions.setFilter('brands', [8]));
	expect(result.current.path.map((entry) => entry.term)).toEqual([{ kind: 'all' }]);
	expect(mockState.filters.brands).toEqual([8]);
	// Leaving takes out only what the path put in (nothing): the pill is the cashier's.
	act(() => result.current.root());
	expect(result.current.path).toEqual([]);
	expect(mockState.filters.brands).toEqual([8]);
});

it('All products tapped over a held shortcut records the filters its own entry left, not the shortcut’s', () => {
	const { result } = renderHook(() => useBrowsePath('shortcuts', terms as never));
	// A second tap on the root while the shortcut's level is held off stage (a cold table).
	act(() => result.current.enter(breakfast, undefined, 0));
	expect(mockState.filters.categories).toEqual([3]);
	act(() => result.current.enter({ kind: 'all' }, undefined, 0));
	expect(mockState.filters.categories).toEqual([]);
	expect(result.current.path.map((entry) => entry.term)).toEqual([{ kind: 'all' }]);
	// A pill under All products (no source field under Shortcuts) narrows it, as anywhere.
	act(() => actions.setFilter('on_sale', true));
	expect(result.current.path.map((entry) => entry.term)).toEqual([{ kind: 'all' }]);
	expect(mockState.filters.on_sale).toBe(true);
});

it('a shortcut applies the quick filter exactly as its chip does; a pill beside its conditions narrows it, moving one of its own leaves it', () => {
	const { result } = renderHook(() => useBrowsePath('shortcuts', terms as never));
	act(() => result.current.enter(breakfast));
	expect(actions.resetFilters).toHaveBeenCalled();
	expect(actions.clearSearch).toHaveBeenCalled();
	expect(actions.setFilter).toHaveBeenLastCalledWith('categories', [3]);
	expect(actions.setSort).toHaveBeenLastCalledWith('name', 'asc');
	expect(result.current.path.map((entry) => entry.term)).toEqual([breakfast]);
	act(() => actions.setFilter('on_sale', true));
	expect(result.current.path.map((entry) => entry.term)).toEqual([breakfast]);
	expect(mockState.filters).toEqual({
		...CLEARED,
		categories: [3],
		status: 'publish',
		on_sale: true,
	});
	// The shortcut's own condition moved: the cashier owns the query now, left as they set it.
	act(() => actions.setFilter('categories', [9]));
	expect(result.current.path).toEqual([]);
	expect(mockState.filters).toEqual({
		...CLEARED,
		categories: [9],
		status: 'publish',
		on_sale: true,
	});
});

it('a chip whose conditions include the shortcut’s narrows the level; a search then takes out only the shortcut’s own', () => {
	const { result } = renderHook(() => useBrowsePath('shortcuts', terms as never));
	act(() => result.current.enter(breakfast));
	expect(mockState.filters.categories).toEqual([3]);
	// Chip B, as filter-bar.tsx QuickChip applies it: categories [3] and on sale. Breakfast's
	// own condition still holds, so the level does: Breakfast, on sale.
	act(() => {
		actions.resetFilters();
		actions.clearSearch();
		actions.setFilter('categories', [3]);
		actions.setFilter('on_sale', true);
		actions.setSort('name', 'asc');
	});
	expect(result.current.path.map((entry) => entry.term)).toEqual([breakfast]);
	expect(mockState.filters).toEqual({
		...CLEARED,
		categories: [3],
		status: 'publish',
		on_sale: true,
	});
	// A search spans the catalogue: Breakfast's condition goes, the cashier's on-sale pill stays.
	act(() => actions.setSearch('lat'));
	expect(result.current.path).toEqual([]);
	expect(mockState.filters).toEqual({ ...CLEARED, status: 'publish', on_sale: true });
});

// Shortcut A writes two keys; a chip pressed inside its level may write only some of them, or
// the same ones under another sort. Either way the query is the chip's, untouched.
const onSaleDrinks = {
	type: 'quick',
	id: 'qf-a',
	label: 'Drinks on sale',
	conditions: [
		{ field: 'categories', value: [3] },
		{ field: 'on_sale', value: true },
	],
};
const shortcutA = {
	kind: 'shortcut' as const,
	id: 'qf-a',
	name: 'Drinks on sale',
	description: '',
};
const withA = { ...terms, quickFilterFor: () => onSaleDrinks };
const applyChip = (
	filters: Record<string, unknown>,
	sort = { field: 'name', direction: 'asc' }
) => {
	actions.resetFilters();
	actions.clearSearch();
	for (const [field, value] of Object.entries(filters)) actions.setFilter(field, value);
	actions.setSort(sort.field, sort.direction as 'asc' | 'desc');
};

it('a chip writing only some of the shortcut’s keys keeps its own condition', () => {
	const { result } = renderHook(() => useBrowsePath('shortcuts', withA as never));
	act(() => result.current.enter(shortcutA));
	act(() => applyChip({ categories: [3] })); // chip B
	expect(result.current.path).toEqual([]);
	expect(mockState.filters).toEqual({ ...CLEARED, categories: [3], status: 'publish' });
});

it('a chip with the shortcut’s filters under another sort is left exactly as it set the query', () => {
	const { result } = renderHook(() => useBrowsePath('shortcuts', withA as never));
	act(() => result.current.enter(shortcutA));
	act(() =>
		applyChip({ categories: [3], on_sale: true }, { field: 'sortable_price', direction: 'desc' })
	);
	expect(mockState.filters).toEqual({
		...CLEARED,
		categories: [3],
		status: 'publish',
		on_sale: true,
	});
	expect(mockState.sort).toEqual({ field: 'sortable_price', direction: 'desc' });
	// The level's filters still hold, so the level does too (its sort is the cashier's).
	expect(result.current.path.map((entry) => entry.term)).toEqual([shortcutA]);
});

// Customise stays open beside a shortcut level: a condition the edit removed must not go on
// filtering as though the cashier had pressed it.
it('a shortcut whose definition changes while its level is open drops the level and takes the entered patch out', () => {
	let definition = onSaleDrinks;
	const mutable = { ...terms, quickFilterFor: () => definition };
	const { result, rerender } = renderHook(() => useBrowsePath('shortcuts', mutable as never));
	act(() => result.current.enter(shortcutA));
	expect(mockState.filters).toMatchObject({ categories: [3], on_sale: true });
	definition = { ...onSaleDrinks, conditions: [{ field: 'categories', value: [3] }] };
	rerender();
	expect(result.current.path).toEqual([]);
	expect(mockState.filters).toEqual({ ...CLEARED, status: 'publish' });
});

it('a shortcut whose configured sort changes while its level is open drops the level too', () => {
	let definition: typeof onSaleDrinks & { sort?: { field: string; direction: string } } =
		onSaleDrinks;
	const mutable = { ...terms, quickFilterFor: () => definition };
	const { result, rerender } = renderHook(() => useBrowsePath('shortcuts', mutable as never));
	act(() => result.current.enter(shortcutA));
	expect(result.current.path.map((entry) => entry.term)).toEqual([shortcutA]);
	definition = { ...onSaleDrinks, sort: { field: 'sortable_price', direction: 'desc' } };
	rerender();
	expect(result.current.path).toEqual([]);
	expect(mockState.filters).toEqual({ ...CLEARED, status: 'publish' });
});

it('a space typed after a shortcut’s own search keeps the level, and leaving still takes the search out', () => {
	const lattes = {
		type: 'quick',
		id: 'qf-l',
		label: 'Lattes',
		conditions: [{ field: 'search', value: 'latte' }],
	};
	const shortcut = { kind: 'shortcut' as const, id: 'qf-l', name: 'Lattes', description: '' };
	const withLattes = { ...terms, quickFilterFor: () => lattes };
	const { result } = renderHook(() => useBrowsePath('shortcuts', withLattes as never));
	act(() => result.current.enter(shortcut));
	expect(mockState.search).toBe('latte');
	act(() => actions.setSearch('latte '));
	expect(result.current.path.map((entry) => entry.term)).toEqual([shortcut]);
	act(() => result.current.root());
	expect(result.current.path).toEqual([]);
	expect(mockState.search).toBe('');
});

it('a sort picked inside a shortcut level keeps the level and its filters', () => {
	const { result } = renderHook(() => useBrowsePath('shortcuts', withA as never));
	act(() => result.current.enter(shortcutA));
	act(() => actions.setSort('sortable_price', 'desc'));
	expect(result.current.path.map((entry) => entry.term)).toEqual([shortcutA]);
	expect(mockState.filters).toEqual({
		...CLEARED,
		categories: [3],
		status: 'publish',
		on_sale: true,
	});
	expect(mockState.sort).toEqual({ field: 'sortable_price', direction: 'desc' });
});

// The level's products table persists a header sort to the settings, which moves the baseline
// sort the shortcut is compared under: the level must hold all the same.
it('a header sort persisted to the settings inside a shortcut level keeps the level and its filters', () => {
	const { result, rerender } = renderHook(() => useBrowsePath('shortcuts', withA as never));
	act(() => result.current.enter(shortcutA));
	act(() => actions.setSort('sortable_price', 'desc'));
	mockSettingsSort = { sortBy: 'sortable_price', sortDirection: 'desc' };
	rerender();
	expect(result.current.path.map((entry) => entry.term)).toEqual([shortcutA]);
	expect(mockState.filters).toEqual({
		...CLEARED,
		categories: [3],
		status: 'publish',
		on_sale: true,
	});
});

it('a search typed inside a term still takes the term out, even after a sort changed in the level', () => {
	const { result } = renderHook(() => useBrowsePath('categories', terms as never));
	act(() => result.current.enter(drinks));
	act(() => actions.setSort('sortable_price', 'desc'));
	expect(result.current.path.length).toBe(1);
	act(() => actions.setSearch('lat'));
	expect(result.current.path).toEqual([]);
	expect(mockState.filters.categories).toEqual([]);
	expect(mockState.search).toBe('lat');
});

it('a Brand pill pressed inside a Categories level narrows the level: the path stays, and leaving keeps the pill', () => {
	const { result } = renderHook(() => useBrowsePath('categories', terms as never));
	act(() => result.current.enter(drinks));
	act(() => actions.setFilter('brands', [8]));
	expect(result.current.path.map((entry) => entry.term)).toEqual([drinks]);
	expect(mockState.filters).toMatchObject({ categories: [1, 2], brands: [8] });
	// A search typed over the narrowed level still spans the catalogue: the term's ids go, the
	// pill (the cashier's) stays.
	act(() => actions.setSearch('lat'));
	expect(result.current.path).toEqual([]);
	expect(mockState.filters.categories).toEqual([]);
	expect(mockState.filters.brands).toEqual([8]);
});

it('a sort inside a term level, or a child added under it, keeps the level live', () => {
	let children = [2];
	const dynamic = {
		...terms,
		idsFor: (term: { id?: number }) =>
			term.id === 1 ? [1, ...children] : term.id ? [term.id] : [],
	};
	const { result, rerender } = renderHook(() => useBrowsePath('categories', dynamic as never));
	act(() => result.current.enter(drinks));
	act(() => actions.setSort('sortable_price', 'desc'));
	expect(result.current.path.length).toBe(1);
	children = [2, 7];
	rerender();
	expect(result.current.path.length).toBe(1);
	expect(mockState.filters.categories).toEqual([1, 2, 7]);
});

it('a Category pill set to another value inside a term drops the path and leaves the pill', () => {
	const { result } = renderHook(() => useBrowsePath('categories', terms as never));
	act(() => result.current.enter(drinks));
	act(() => actions.setFilter('categories', [9]));
	expect(result.current.path).toEqual([]);
	expect(mockState.filters.categories).toEqual([9]);
});

it('leaving a shortcut level takes its patch back out; a search typed over it keeps the search and drops the patch', () => {
	const { result } = renderHook(() => useBrowsePath('shortcuts', terms as never));
	act(() => result.current.enter(breakfast));
	act(() => result.current.root());
	expect(mockState.filters).toEqual({ ...CLEARED, status: 'publish' });
	act(() => result.current.enter(breakfast));
	act(() => actions.setSearch('lat'));
	expect(result.current.path).toEqual([]);
	expect(mockState.search).toBe('lat');
	expect(mockState.filters).toEqual({ ...CLEARED, status: 'publish' });
});

it.each([
	[true, 'clears it'],
	[false, "sets it back to 'instock'"],
])(
	'leaving a shortcut on in-stock restores the device baseline (showOutOfStock %s %s), not nothing',
	(showOutOfStock) => {
		mockShowOutOfStock = showOutOfStock;
		mockState = { ...mockState, filters: baseline() };
		const instock = {
			type: 'quick',
			id: 'qf-2',
			label: 'In stock',
			conditions: [{ field: 'stock_status', value: 'instock' }],
		};
		const shortcut = { kind: 'shortcut' as const, id: 'qf-2', name: 'In stock', description: '' };
		const withInstock = { ...terms, quickFilterFor: () => instock, rootsOf: () => [shortcut] };
		const { result } = renderHook(() => useBrowsePath('shortcuts', withInstock as never));
		act(() => result.current.enter(shortcut));
		expect(result.current.path.length).toBe(1);
		act(() => result.current.root());
		// Whether stock_status survives is the baseline's call, never a bare clear.
		if (showOutOfStock) {
			expect(actions.clearFilter).toHaveBeenLastCalledWith('stock_status');
			expect(mockState.filters.stock_status).toBeUndefined();
		} else {
			expect(actions.setFilter).toHaveBeenLastCalledWith('stock_status', 'instock');
			expect(mockState.filters.stock_status).toBe('instock');
		}
		expect(mockState.filters.status).toBe('publish');
	}
);

it('changing the source clears the projection the old source made, and the path is empty in that same render', () => {
	const { result, rerender } = renderHook(({ source }) => useBrowsePath(source, terms as never), {
		initialProps: { source: 'categories' as 'categories' | 'tags' },
	});
	act(() => result.current.enter({ kind: 'all' }));
	expect(result.current.path.length).toBe(1);
	rerender({ source: 'tags' });
	expect(result.current.path).toEqual([]); // not a render later: the new source never sees it
	act(() => result.current.enter(drinks));
	expect(mockState.filters.tags).toEqual([1, 2]);
	rerender({ source: 'categories' });
	expect(mockState.filters.tags).toEqual([]);
	expect(result.current.path).toEqual([]);
});

it('a term that leaves the source drops the path to the root', () => {
	let all = [drinks, hot];
	const { result, rerender } = renderHook(() =>
		useBrowsePath('categories', { ...terms, all } as never)
	);
	act(() => result.current.enter(drinks));
	expect(result.current.path.length).toBe(1);
	all = [hot];
	rerender();
	expect(result.current.path).toEqual([]);
	expect(actions.clearFilter).toHaveBeenLastCalledWith('categories');
});

// The open term's count drops to zero: the source holds its list while it looks for a product
// carrying it, and the term may be missing from that list meanwhile — unknown, not deleted.
it('an open term whose count just dropped to zero keeps its path while its existence read is pending', () => {
	let source: { all: unknown[]; pending: boolean } = { all: [drinks, hot], pending: false };
	const { result, rerender } = renderHook(() =>
		useBrowsePath('categories', { ...terms, ...source } as never)
	);
	act(() => result.current.enter(drinks));
	source = { all: [hot], pending: true };
	rerender();
	expect(result.current.path.map((entry) => entry.term)).toEqual([drinks]);
	// Answered with a product carrying it: still there.
	source = { all: [drinks, hot], pending: false };
	rerender();
	expect(result.current.path.map((entry) => entry.term)).toEqual([drinks]);
	// Answered without one: gone, and the path with it.
	source = { all: [hot], pending: true };
	rerender();
	expect(result.current.path.length).toBe(1);
	source = { all: [hot], pending: false };
	rerender();
	expect(result.current.path).toEqual([]);
});

it('a parent reparented or deleted under an open child drops the path', () => {
	let all: unknown[] = [drinks, hot];
	const { result, rerender } = renderHook(() =>
		useBrowsePath('categories', { ...terms, all } as never)
	);
	act(() => {
		result.current.enter(drinks);
		result.current.enter(hot);
	});
	expect(result.current.path.length).toBe(2);
	all = [drinks, { ...hot, parent: 99 }]; // Hot now belongs elsewhere
	rerender();
	expect(result.current.path).toEqual([]);
});

it('a child added under the open term re-projects the level in place instead of dropping it', () => {
	let children = [2];
	const dynamic = {
		...terms,
		idsFor: (term: { id?: number }) =>
			term.id === 1 ? [1, ...children] : term.id ? [term.id] : [],
	};
	const { result, rerender } = renderHook(() => useBrowsePath('categories', dynamic as never));
	act(() => result.current.enter(drinks));
	expect(mockState.filters.categories).toEqual([1, 2]);
	children = [2, 7];
	rerender();
	expect(result.current.path.length).toBe(1);
	expect(mockState.filters.categories).toEqual([1, 2, 7]);
});

// The in-place re-projection writes the level's filter, and a result change resets the window:
// a live level paged past its first window must keep it, in the same state as the new ids.
it('a child added under a paged open term re-projects it with its window kept, in one state', () => {
	let children = [2];
	const dynamic = {
		...terms,
		idsFor: (term: { id?: number }) =>
			term.id === 1 ? [1, ...children] : term.id ? [term.id] : [],
	};
	const seen: { categories: unknown; limit: number }[] = [];
	const { result, rerender } = renderHook(() => {
		const browse = useBrowsePath('categories', dynamic as never);
		seen.push({ categories: mockState.filters.categories, limit: mockState.limit });
		return browse;
	});
	act(() => result.current.enter(drinks));
	act(() => {
		actions.extendLimit();
		actions.extendLimit();
	});
	expect(mockState).toMatchObject({ filters: { categories: [1, 2] }, limit: PAGE * 3 });
	children = [2, 7];
	seen.length = 0;
	rerender();
	expect(result.current.path.length).toBe(1);
	expect(mockState).toMatchObject({ filters: { categories: [1, 2, 7] }, limit: PAGE * 3 });
	// Never the new ids under the base page: the filter and the window land together.
	expect(
		seen.filter(({ categories, limit }) => isEqualIds(categories, [1, 2, 7]) && limit === PAGE)
	).toEqual([]);
});

it('a root term reparented under another visible term drops the path', () => {
	const food = { kind: 'term' as const, id: 5, name: 'Food', count: 3 };
	let all: unknown[] = [drinks, food];
	const { result, rerender } = renderHook(() =>
		useBrowsePath('categories', { ...terms, all } as never)
	);
	act(() => result.current.enter(drinks));
	all = [{ ...drinks, parent: 5 }, food]; // Drinks is now under Food: not reachable from the root
	rerender();
	expect(result.current.path).toEqual([]);
});

it('unmounting clears the projection (Browse by → All products)', () => {
	const { result, unmount } = renderHook(() => useBrowsePath('categories', terms as never));
	act(() => result.current.enter(drinks));
	expect(mockState.filters.categories).toEqual([1, 2]);
	unmount();
	expect(mockState.filters.categories).toEqual([]);
});

it('a whitespace-only search is no search: the path stays live and its filter stays', () => {
	const { result } = renderHook(() => useBrowsePath('categories', terms as never));
	act(() => result.current.enter(drinks));
	act(() => actions.setSearch('  '));
	expect(result.current.path.map((entry) => entry.term)).toEqual([drinks]);
	expect(mockState.filters.categories).toEqual([1, 2]);
	act(() => result.current.enter({ kind: 'all' }, undefined, 0));
	expect(result.current.path.map((entry) => entry.term)).toEqual([{ kind: 'all' }]);
});

it('enter at a depth replaces the path below it with one projection, never nesting a second tap', () => {
	const food = { kind: 'term' as const, id: 5, name: 'Food', count: 3 };
	const { result } = renderHook(() =>
		useBrowsePath('categories', {
			...terms,
			all: [drinks, hot, food],
			idsFor: (term: { id?: number }) => (term.id === 5 ? [5] : terms.idsFor(term as never)),
		} as never)
	);
	// Two taps on the root before the first level is on stage.
	act(() => {
		result.current.enter(drinks, undefined, 0);
		result.current.enter(drinks, undefined, 0);
	});
	expect(result.current.path.map((entry) => entry.term)).toEqual([drinks]);
	act(() => result.current.enter(food, undefined, 0));
	expect(result.current.path.map((entry) => entry.term)).toEqual([food]);
	expect(mockState.filters.categories).toEqual([5]);
	// A child tapped twice on its parent's level is one level.
	act(() => result.current.enter(drinks, undefined, 0));
	act(() => {
		result.current.enter(hot, undefined, 1);
		result.current.enter(hot, undefined, 1);
	});
	expect(result.current.path.map((entry) => entry.term)).toEqual([drinks, hot]);
	expect(mockState.filters.categories).toEqual([2]);
	expect(actions.setFilter).toHaveBeenLastCalledWith('categories', [2]);
});

// The edge swipe's end is not a discrete event: a `backTo` from a lower-priority caller,
// unbatched, commits the parent's query under the child's path for a render (the child level
// then reads as settled over the parent's products). In one batch the query and the path move
// together. A transition is the caller here: in jsdom a bare timer's updates happen to land
// together, a transition's reliably do not.
it('a backTo from a non-discrete callback, in one batch, moves the query and the path in one render', async () => {
	const seen: { depth: number; categories: unknown }[] = [];
	const { result } = renderHook(() => {
		const browse = useBrowsePath('categories', terms as never);
		seen.push({ depth: browse.path.length, categories: mockState.filters.categories });
		return browse;
	});
	act(() => {
		result.current.enter(drinks);
		result.current.enter(hot);
	});
	actions.setFilter.mockClear();
	seen.length = 0;
	await act(
		() =>
			new Promise<void>((resolve) =>
				setTimeout(() => {
					startTransition(() => inOneBatch(() => result.current.backTo(1)));
					resolve();
				}, 0)
			)
	);
	expect(result.current.path.map((entry) => entry.term)).toEqual([drinks]);
	expect(mockState.filters.categories).toEqual([1, 2]);
	// One write, the parent's ids — no stray re-projection of the child's.
	expect(actions.setFilter.mock.calls).toEqual([['categories', [1, 2]]]);
	// Never Hot's path over Drinks' query.
	expect(
		seen.filter(({ depth, categories }) => depth === 2 && isEqualIds(categories, [1, 2]))
	).toEqual([]);
});

// Native: `inOneBatch` is a plain call, and Android's back arrives from the device event emitter,
// outside React's event system. The query writes render at sync priority; a path kept in
// `useState` rendered at a lower one, a commit later — the child level over the parent's
// products (review of the Android follow-on, 2026-10-07). The path is read like the query, so
// whatever lane the caller's own updates take, the two move in one render. A transition is the
// caller here because it reliably separates a `useState` write from a sync one in jsdom.
it('a backTo from outside React’s event system, with no batching at all, moves the query and the path in one render', async () => {
	const { inOneBatch: nativeBatch } =
		jest.requireActual<typeof import('../one-batch')>('../one-batch');
	const seen: { depth: number; categories: unknown }[] = [];
	const { result } = renderHook(() => {
		const browse = useBrowsePath('categories', terms as never);
		seen.push({ depth: browse.path.length, categories: mockState.filters.categories });
		return browse;
	});
	act(() => {
		result.current.enter(drinks);
		result.current.enter(hot);
	});
	seen.length = 0;
	await act(
		() =>
			new Promise<void>((resolve) =>
				setTimeout(() => {
					startTransition(() => nativeBatch(() => result.current.backTo(1)));
					resolve();
				}, 0)
			)
	);
	expect(result.current.path.map((entry) => entry.term)).toEqual([drinks]);
	expect(mockState.filters.categories).toEqual([1, 2]);
	expect(
		seen.filter(({ depth, categories }) => depth === 2 && isEqualIds(categories, [1, 2]))
	).toEqual([]);
});

// The register's two layouts are two trees: a window resized across the phone boundary mounts
// the products screen afresh in the other. Under the POS layout's PersistedStateProvider the
// path (and the query, kept the same way) carries on; the dealt tiles it was entered from are
// gone, so their `target`s go.
describe('a persisted path', () => {
	let latest: BrowsePath | null = null;
	function Probe({ source }: { source: 'categories' | 'tags' }) {
		// eslint-disable-next-line react-compiler/react-compiler -- the test reads the hook's result
		latest = useBrowsePath(source, terms as never, 'pos-browse:scope');
		return null;
	}
	function Releaser() {
		useReleaseBrowsePath('pos-browse:scope', true);
		return null;
	}
	const host = (child: ReturnType<typeof createElement> | null) =>
		createElement(PersistedStateProvider, null, child);

	it('survives its stage unmounting and mounting again, without the old tiles', () => {
		const { rerender } = render(host(createElement(Probe, { source: 'categories' })));
		act(() => latest!.enter(drinks, { measureInWindow: () => {} } as never));
		expect(mockState.filters.categories).toEqual([1, 2]);
		rerender(host(null));
		// Nothing taken out on the way down: the query is persisted too.
		expect(mockState.filters.categories).toEqual([1, 2]);
		rerender(host(createElement(Probe, { source: 'categories' })));
		expect(latest!.path.map((entry) => entry.term)).toEqual([drinks]);
		expect(latest!.path[0].target).toBeUndefined();
		act(() => latest!.root());
		expect(latest!.path).toEqual([]);
		expect(mockState.filters.categories).toEqual([]);
	});

	it('is dropped, and its projection taken out, by a stage for another source', () => {
		const { rerender } = render(host(createElement(Probe, { source: 'categories' })));
		act(() => latest!.enter(drinks));
		rerender(host(null));
		rerender(host(createElement(Probe, { source: 'tags' })));
		expect(latest!.path).toEqual([]);
		expect(mockState.filters.categories).toEqual([]);
	});

	it('is released by All products mode', () => {
		const { rerender } = render(host(createElement(Probe, { source: 'categories' })));
		act(() => latest!.enter(drinks));
		rerender(host(null));
		expect(mockState.filters.categories).toEqual([1, 2]);
		rerender(host(createElement(Releaser)));
		expect(mockState.filters.categories).toEqual([]);
		// Back to Categories: nothing to pick up.
		rerender(host(createElement(Probe, { source: 'categories' })));
		expect(latest!.path).toEqual([]);
	});

	it('without a key, leaving takes the projection out as before', () => {
		const { result, unmount } = renderHook(() => useBrowsePath('categories', terms as never));
		act(() => result.current.enter(drinks));
		unmount();
		expect(mockState.filters.categories).toEqual([]);
	});
});

describe('filtersAtBaseline', () => {
	const initial = { status: 'publish', stock_status: 'instock' };
	it('reads the initial filters, with the taxonomies cleared, as the baseline', () => {
		expect(filtersAtBaseline({ ...CLEARED, ...initial }, initial)).toBe(true);
	});
	it('reads a narrowing filter as not at baseline', () => {
		expect(filtersAtBaseline({ ...CLEARED, ...initial, categories: [9] }, initial)).toBe(false);
	});
	it('reads an id list as a set: the same ids in another order are the baseline', () => {
		const place = { ...initial, categories: [1, 2] };
		expect(filtersAtBaseline({ ...CLEARED, ...initial, categories: [2, 1] }, place)).toBe(true);
	});
	// The default In-stock pill cleared deletes stock_status: the query is BROADER than the
	// baseline, which is not the baseline either.
	it('reads an initial filter the live filters no longer carry as not at baseline', () => {
		expect(filtersAtBaseline({ ...CLEARED, status: 'publish' }, initial)).toBe(false);
	});
});

function isEqualIds(left: unknown, right: number[]) {
	return (
		Array.isArray(left) && left.length === right.length && right.every((id) => left.includes(id))
	);
}
