/** @jest-environment jsdom */
import { startTransition } from 'react';

import { act, renderHook } from '@testing-library/react';

import { inOneBatch } from '../one-batch.web';
import { filtersAtBaseline, useBrowsePath } from './use-browse-path';

// A tiny in-memory store, so the hook is tested against real state transitions. It keeps the
// real store's shape (query-state-store.tsx): the taxonomy fields are always present, cleared to
// [] (never deleted), and resetFilters restores the device baseline — which carries
// stock_status: 'instock' when out-of-stock products are hidden.
const CLEARED = { categories: [] as number[], tags: [] as number[], brands: [] as number[] };
let mockShowOutOfStock = true;
const baseline = (): Record<string, unknown> => ({
	...CLEARED,
	status: 'publish',
	...(mockShowOutOfStock ? {} : { stock_status: 'instock' }),
});
let mockState = {
	search: '',
	filters: {} as Record<string, unknown>,
	sort: { field: 'name', direction: 'asc' },
};
const mockListeners = new Set<() => void>();
const emit = () => mockListeners.forEach((listener) => listener());
const mockActions = {
	setFilter: jest.fn((field: string, value: unknown) => {
		mockState = { ...mockState, filters: { ...mockState.filters, [field]: value } };
		emit();
	}),
	clearFilter: jest.fn((field: string) => {
		const { [field]: _, ...rest } = mockState.filters;
		mockState = {
			...mockState,
			filters: field in CLEARED ? { ...rest, [field]: [] } : rest,
		};
		emit();
	}),
	resetFilters: jest.fn(() => {
		mockState = { ...mockState, filters: baseline() };
		emit();
	}),
	clearSearch: jest.fn(() => {
		mockState = { ...mockState, search: '' };
		emit();
	}),
	setSearch: jest.fn((search: string) => {
		mockState = { ...mockState, search };
		emit();
	}),
	setSort: jest.fn((field: string, direction: 'asc' | 'desc') => {
		mockState = { ...mockState, sort: { field, direction } };
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
		uiSettings: { sortBy: 'name', sortDirection: 'asc', showOutOfStock: mockShowOutOfStock },
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
	mockState = { search: '', filters: baseline(), sort: { field: 'name', direction: 'asc' } };
	jest.clearAllMocks();
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

it('a shortcut applies the quick filter exactly as its chip does and is shown while active', () => {
	const { result } = renderHook(() => useBrowsePath('shortcuts', terms as never));
	act(() => result.current.enter(breakfast));
	expect(actions.resetFilters).toHaveBeenCalled();
	expect(actions.clearSearch).toHaveBeenCalled();
	expect(actions.setFilter).toHaveBeenLastCalledWith('categories', [3]);
	expect(actions.setSort).toHaveBeenLastCalledWith('name', 'asc');
	expect(result.current.path.map((entry) => entry.term)).toEqual([breakfast]);
	act(() => actions.setFilter('on_sale', true));
	expect(result.current.path).toEqual([]);
	// The cashier moved the query somewhere the shortcut did not write: it is theirs now, and is
	// left exactly as they set it (the shortcut's own condition included).
	expect(mockState.filters).toEqual({
		...CLEARED,
		categories: [3],
		status: 'publish',
		on_sale: true,
	});
});

it('a chip pressed inside a shortcut level keeps the condition it shares with the shortcut', () => {
	const { result } = renderHook(() => useBrowsePath('shortcuts', terms as never));
	act(() => result.current.enter(breakfast));
	expect(mockState.filters.categories).toEqual([3]);
	// Chip B, as filter-bar.tsx QuickChip applies it: categories [3] and on sale.
	act(() => {
		actions.resetFilters();
		actions.clearSearch();
		actions.setFilter('categories', [3]);
		actions.setFilter('on_sale', true);
		actions.setSort('name', 'asc');
	});
	expect(result.current.path).toEqual([]);
	expect(mockState.filters).toEqual({
		...CLEARED,
		categories: [3],
		status: 'publish',
		on_sale: true,
	});
	// Forgotten, not deferred: nothing comes out later either.
	act(() => actions.setSearch('lat'));
	expect(mockState.filters.categories).toEqual([3]);
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

it('a Brand pill pressed inside a Categories level drops the path and leaves both pills as the cashier sees them', () => {
	const { result } = renderHook(() => useBrowsePath('categories', terms as never));
	act(() => result.current.enter(drinks));
	act(() => actions.setFilter('brands', [8]));
	expect(result.current.path).toEqual([]);
	expect(mockState.filters.brands).toEqual([8]);
	// The cashier's pill owns the query now: the term's ids are not taken out from under it.
	expect(mockState.filters.categories).toEqual([1, 2]);
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

describe('filtersAtBaseline', () => {
	const initial = { status: 'publish', stock_status: 'instock' };
	it('reads the initial filters, with the taxonomies cleared, as the baseline', () => {
		expect(filtersAtBaseline({ ...CLEARED, ...initial }, initial)).toBe(true);
	});
	it('reads a narrowing filter as not at baseline', () => {
		expect(filtersAtBaseline({ ...CLEARED, ...initial, categories: [9] }, initial)).toBe(false);
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
