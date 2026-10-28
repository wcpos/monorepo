/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { activeConditions, POSFilterBar } from './filter-bar/filter-bar';
import { QueryStateProvider, useQueryState, useQueryStateActions } from '../../../../query';

const push = jest.fn();
const modifyUI = jest.fn();
let filterBar: unknown[] | undefined;
jest.mock('expo-router', () => ({ useRouter: () => ({ push }) }));
jest.mock('@wcpos/query', () => ({
	useDocField: (_: unknown, select: (value: object) => unknown) =>
		select({ showOutOfStock: true, sortBy: 'name', sortDirection: 'asc', filterBar }),
}));
jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({ uiSettings: {}, modifyUI }),
}));
jest.mock('@wcpos/query/record-readers', () => ({
	useEngineRecordsByWooId: (_field: string, ids: number[]) =>
		ids.map((id) => ({ payload: { name: id === 1 ? 'Drinks' : 'Food' } })),
}));
jest.mock('observable-hooks', () => ({ useObservableSuspense: (value: unknown) => value }));
jest.mock('../../hooks/use-stock-status-label', () => ({
	useStockStatusLabel: () => ({
		items: [
			{ value: 'instock', label: 'In stock' },
			{ value: 'outofstock', label: 'Out of stock' },
		],
	}),
}));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/chip', () => ({
	Chip: ({
		label,
		count,
		on,
		dimmed,
		testID,
		clearTestID,
		onPress,
		onClear,
		onLongPress,
	}: {
		label: string;
		count?: number | string;
		on?: boolean;
		dimmed?: boolean;
		testID: string;
		clearTestID?: string;
		onPress: () => void;
		onClear?: () => void;
		onLongPress?: () => void;
	}) => (
		<div data-testid={testID} data-on={!!on} data-dimmed={!!dimmed}>
			<button disabled={dimmed} onClick={onPress} onContextMenu={onLongPress}>
				{label}
				{count !== undefined && ` ${count}`}
			</button>
			{onClear && (
				<button disabled={dimmed} data-testid={clearTestID} onClick={onClear}>
					×
				</button>
			)}
		</div>
	),
}));
jest.mock('@wcpos/components/button', () => ({
	Button: ({
		children,
		onPress,
		testID,
	}: React.PropsWithChildren<{ onPress: () => void; testID: string }>) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: React.PropsWithChildren) => children,
}));

jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: React.PropsWithChildren) => children,
}));
jest.mock('@wcpos/components/tooltip', () => ({
	Tooltip: ({ children }: React.PropsWithChildren) => children,
	TooltipTrigger: ({ children }: React.PropsWithChildren) => children,
	TooltipContent: ({ children }: React.PropsWithChildren) => <span role="tooltip">{children}</span>,
}));
jest.mock('@wcpos/components/combobox', () => ({
	Combobox: ({ children }: React.PropsWithChildren) => children,
	ComboboxTrigger: ({ children }: React.PropsWithChildren) => children,
	ComboboxContent: () => null,
}));
jest.mock('@wcpos/components/tree-combobox', () => ({
	TreeCombobox: ({ children }: React.PropsWithChildren) => children,
	TreeComboboxTrigger: ({ children }: React.PropsWithChildren) => children,
	TreeComboboxContent: () => null,
}));
jest.mock('@wcpos/components/select', () => ({
	Select: ({ children }: React.PropsWithChildren) => children,
	SelectPrimitiveTrigger: ({ children }: React.PropsWithChildren) => children,
	SelectContent: () => null,
	SelectItem: () => null,
}));
jest.mock('../../components/product/collection-search', () => ({
	CollectionSearch: () => null,
}));
jest.mock('../../components/product/category-select', () => ({
	CategoryTreeLoader: () => null,
}));
function State() {
	const actions = useQueryStateActions();
	return (
		<output data-testid="state" onClick={() => actions.setSearch('tea')}>
			{JSON.stringify(useQueryState())}
		</output>
	);
}
function mount(level: 'products' | 'variations' = 'products', categories: number[] = []) {
	return render(
		<QueryStateProvider
			collection="products"
			initialPageSize={10}
			initialSort={{ field: 'name', direction: 'asc' }}
			initialFilters={{ status: 'publish', categories, tags: [], brands: [] }}
		>
			<POSFilterBar level={level} />
			<State />
		</QueryStateProvider>
	);
}
const press = (id: string) => fireEvent.click(screen.getByTestId(id).querySelector('button')!);
it.each(['featured', 'on_sale'])('toggles the %s chip fill in both directions', (field) => {
	mount();
	const chip = screen.getByTestId(`filter-pill-${field}`);
	expect(chip.getAttribute('data-on')).toBe('false');
	press(`filter-pill-${field}`);
	expect(chip.getAttribute('data-on')).toBe('true');
	press(`filter-pill-${field}`);
	expect(chip.getAttribute('data-on')).toBe('false');
});
it('reads the first selection and remaining count; × clears the whole group', () => {
	mount('products', [1, 2]);
	expect(screen.getByTestId('filter-pill-categories').textContent).toContain('Drinks +1');
	fireEvent.click(screen.getByTestId('filter-pill-remove-categories'));
	expect(screen.getByTestId('filter-pill-categories').getAttribute('data-on')).toBe('false');
	expect(JSON.parse(screen.getByTestId('state').textContent!).filters.categories).toEqual([]);
});
it('dims the product-only chips with the explanation, leaving stock enabled', () => {
	mount('variations');
	for (const field of ['categories', 'featured', 'on_sale', 'tags', 'brands']) {
		expect(screen.getByTestId(`filter-pill-${field}`).getAttribute('data-dimmed')).toBe('true');
	}
	expect(
		screen
			.getAllByRole('tooltip')
			.every((node) => node.textContent === 'pos_products.product_filter_not_in_variations')
	).toBe(true);
	expect(screen.getByTestId('filter-pill-stock_status').getAttribute('data-dimmed')).toBe('false');
});
it('offers Clear all after two groups and resets groups and search', () => {
	mount();
	fireEvent.click(screen.getByTestId('state'));
	expect(JSON.parse(screen.getByTestId('state').textContent!).search).toBe('tea');
	press('filter-pill-featured');
	expect(screen.queryByTestId('filter-bar-clear-all')).toBeNull();
	press('filter-pill-on_sale');
	fireEvent.click(screen.getByTestId('filter-bar-clear-all'));
	const state = JSON.parse(screen.getByTestId('state').textContent!);
	expect(state.search).toBe('');
	expect(state.filters.featured).toBeUndefined();
	expect(state.filters.on_sale).toBeUndefined();
	expect(screen.queryByTestId('filter-bar-clear-all')).toBeNull();
});
it('does not count the hidden in-stock baseline as a group', () => {
	const initialFilters = {
		status: 'publish' as const,
		stock_status: 'instock' as const,
		categories: [],
		tags: [],
		brands: [],
	};
	render(
		<QueryStateProvider
			collection="products"
			initialPageSize={10}
			initialSort={{ field: 'name', direction: 'asc' }}
			initialFilters={initialFilters}
		>
			<POSFilterBar initialFilters={initialFilters} />
			<State />
		</QueryStateProvider>
	);
	press('filter-pill-featured');
	expect(screen.queryByTestId('filter-bar-clear-all')).toBeNull();
	press('filter-pill-on_sale');
	expect(screen.getByTestId('filter-bar-clear-all')).toBeTruthy();
});

// Inside a browse level the crumb is the source's own condition: that pill folds, it is not a
// group for Clear all, and Clear all leaves it (the level stays, its conditions go).
it('folds the place’s pill, and Clear all keeps the place', () => {
	render(
		<QueryStateProvider
			collection="products"
			initialPageSize={10}
			initialSort={{ field: 'name', direction: 'asc' }}
			initialFilters={{ status: 'publish', categories: [1, 2], tags: [], brands: [] }}
		>
			<POSFilterBar place={{ field: 'categories' }} />
			<State />
		</QueryStateProvider>
	);
	expect(screen.queryByTestId('filter-pill-categories')).toBeNull();
	press('filter-pill-featured');
	expect(screen.queryByTestId('filter-bar-clear-all')).toBeNull();
	press('filter-pill-on_sale');
	fireEvent.click(screen.getByTestId('filter-bar-clear-all'));
	const state = JSON.parse(screen.getByTestId('state').textContent!);
	expect(state.filters.featured).toBeUndefined();
	expect(state.filters.on_sale).toBeUndefined();
	expect(state.filters.categories).toEqual([1, 2]);
});

// A shortcut level's place is the shortcut's own conditions: not groups for Clear all, and
// written back by it.
it('inside a shortcut level, Clear all keeps the shortcut’s own conditions', () => {
	const breakfast = {
		type: 'quick',
		id: 'qf-breakfast',
		label: 'Breakfast',
		conditions: [{ field: 'categories', value: [3] }],
	} as unknown as NonNullable<React.ComponentProps<typeof POSFilterBar>['place']>['quickFilter'];
	render(
		<QueryStateProvider
			collection="products"
			initialPageSize={10}
			initialSort={{ field: 'name', direction: 'asc' }}
			initialFilters={{ status: 'publish', categories: [3], tags: [], brands: [] }}
		>
			<POSFilterBar place={{ field: null, quickFilter: breakfast }} />
			<State />
		</QueryStateProvider>
	);
	// The Category pill is not the place's field under Shortcuts: it shows, but its value is the
	// shortcut's and does not count.
	expect(screen.getByTestId('filter-pill-categories')).toBeTruthy();
	press('filter-pill-featured');
	expect(screen.queryByTestId('filter-bar-clear-all')).toBeNull();
	press('filter-pill-on_sale');
	fireEvent.click(screen.getByTestId('filter-bar-clear-all'));
	const state = JSON.parse(screen.getByTestId('state').textContent!);
	expect(state.filters.featured).toBeUndefined();
	expect(state.filters.on_sale).toBeUndefined();
	expect(state.filters.categories).toEqual([3]);
});

jest.mock('uuid', () => ({ v4: () => 'test-id' }));

jest.mock('@rn-primitives/dropdown-menu', () =>
	jest.requireActual(
		require.resolve('@rn-primitives/dropdown-menu').replace(/index\.js$/, 'dropdown-menu.web.js')
	)
);
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/text', () => ({
	TextClassContext: React.createContext(''),
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/lib/device', () => ({
	useIsPhone: () => false,
	usePointer: () => 'fine',
}));
jest.mock('@wcpos/components/lib/overlay', () => ({
	OVERLAY_PANEL: {},
	OVERLAY_MOTION: { anchored: {} },
	OverlayShell: ({ children }: React.PropsWithChildren) => children,
	// The menu's shell, anchored: the primitive's portal and positioned content.
	AnchoredOverlay: ({ anchor, content: { inline: _i, portalHost: _p, ...content } }: any) => (
		<anchor.Portal>
			<anchor.Content {...content} />
		</anchor.Portal>
	),
	useOverlayPresentation: () => 'anchored',
}));
jest.mock('@wcpos/components/alert-dialog', () => ({
	AlertDialog: ({ open, children }: React.PropsWithChildren<{ open: boolean }>) =>
		open ? children : null,
	AlertDialogContent: ({ children }: React.PropsWithChildren) => children,
	AlertDialogHeader: ({ children }: React.PropsWithChildren) => children,
	AlertDialogTitle: ({ children }: React.PropsWithChildren) => children,
	AlertDialogDescription: ({ children }: React.PropsWithChildren) => children,
	AlertDialogFooter: ({ confirm }: { confirm: { testID: string; onPress: () => void } }) => (
		<button data-testid={confirm.testID} onClick={confirm.onPress} />
	),
}));
beforeEach(() => {
	filterBar = undefined;
	jest.clearAllMocks();
});
it('opens the quick filter Edit menu from the long-press callback', () => {
	filterBar = [
		{
			id: 'saved',
			type: 'quick',
			label: 'Saved',
			conditions: [{ field: 'featured', value: true }],
		},
	];
	mount();
	expect(screen.queryByText('pos_products.edit_quick_filter')).toBeNull();
	fireEvent.contextMenu(screen.getByTestId('quick-filter-saved').querySelector('button')!);
	fireEvent.click(screen.getByText('pos_products.edit_quick_filter'));
	expect(push).toHaveBeenCalledWith('/(app)/(modals)/filter-bar?edit=saved');
});
it('hides a built-in pill from its menu without changing other items', () => {
	mount();
	fireEvent.contextMenu(screen.getByTestId('filter-pill-featured').querySelector('button')!);
	fireEvent.click(screen.getByText('pos_products.hide_from_bar'));
	const [, modifier] = modifyUI.mock.calls[0];
	expect(modifier([{ id: 'featured', type: 'pill', show: true }])[0]).toEqual({
		id: 'featured',
		type: 'pill',
		show: false,
	});
});

it('keeps the empty menu trigger out of the tab order and after the chip', () => {
	mount();
	const chip = screen.getByTestId('filter-pill-featured');
	const trigger = chip.parentElement!.querySelector('[aria-haspopup="menu"]')!;
	expect(trigger.getAttribute('tabindex')).toBe('-1');
	expect(trigger.getAttribute('aria-hidden')).toBe('true');
	expect(chip.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it('puts Remove last and removes the quick filter only after confirmation', () => {
	filterBar = [
		{
			id: 'saved',
			type: 'quick',
			label: 'Saved',
			conditions: [{ field: 'featured', value: true }],
		},
	];
	mount();
	fireEvent.contextMenu(screen.getByTestId('quick-filter-saved').querySelector('button')!);
	expect(screen.getAllByRole('menuitem').map((row) => row.getAttribute('data-testid'))).toEqual([
		'filter-bar-menu-edit-saved',
		'filter-bar-menu-customize-saved',
		'filter-bar-menu-remove-saved',
	]);
	fireEvent.click(screen.getByTestId('filter-bar-menu-remove-saved'));
	expect(modifyUI).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('filter-bar-delete-confirm'));
	const [, remove] = modifyUI.mock.calls[0];
	expect(remove(filterBar)).not.toEqual(
		expect.arrayContaining([expect.objectContaining({ id: 'saved' })])
	);
});

it('offers Save as button at one group, not zero, and routes the captured group without writing', () => {
	mount();
	expect(screen.queryByTestId('filter-bar-save-as-button')).toBeNull();
	press('filter-pill-featured');
	expect(screen.queryByTestId('filter-bar-clear-all')).toBeNull();
	fireEvent.click(screen.getByTestId('filter-bar-save-as-button'));
	expect(push).toHaveBeenCalledWith({
		pathname: '/(app)/(modals)/filter-bar',
		params: {
			capture: JSON.stringify({ conditions: [{ field: 'featured', value: true }] }),
		},
	});
	expect(modifyUI).not.toHaveBeenCalled();
});
it('counts an explicit false predicate as a set group, so Save as button offers it', () => {
	render(
		<QueryStateProvider
			collection="products"
			initialPageSize={10}
			initialSort={{ field: 'name', direction: 'asc' }}
			initialFilters={{ status: 'publish', on_sale: false }}
		>
			<POSFilterBar initialFilters={{ status: 'publish' }} />
			<State />
		</QueryStateProvider>
	);
	fireEvent.click(screen.getByTestId('filter-bar-save-as-button'));
	expect(push).toHaveBeenCalledWith({
		pathname: '/(app)/(modals)/filter-bar',
		params: { capture: JSON.stringify({ conditions: [{ field: 'on_sale', value: false }] }) },
	});
});
it('clears an applied built-in before hiding it', () => {
	mount();
	press('filter-pill-featured');
	fireEvent.contextMenu(screen.getByTestId('filter-pill-featured').querySelector('button')!);
	fireEvent.click(screen.getByTestId('filter-bar-menu-hide-featured'));
	expect(JSON.parse(screen.getByTestId('state').textContent!).filters.featured).toBeUndefined();
	expect(modifyUI).toHaveBeenCalled();
});
it.each(['instock', 'outofstock'] as const)(
	'restores the in-stock baseline when hiding the stock pill set to %s',
	(stock_status) => {
		render(
			<QueryStateProvider
				collection="products"
				initialPageSize={10}
				initialSort={{ field: 'name', direction: 'asc' }}
				initialFilters={{ status: 'publish', stock_status }}
			>
				<POSFilterBar initialFilters={{ status: 'publish', stock_status: 'instock' }} />
				<State />
			</QueryStateProvider>
		);
		fireEvent.contextMenu(screen.getByTestId('filter-pill-stock_status').querySelector('button')!);
		fireEvent.click(screen.getByTestId('filter-bar-menu-hide-stock_status'));
		expect(JSON.parse(screen.getByTestId('state').textContent!).filters.stock_status).toBe(
			'instock'
		);
		expect(modifyUI).toHaveBeenCalled();
	}
);
it('restores the baseline when removal of an active quick filter is confirmed', () => {
	filterBar = [
		{
			id: 'saved',
			type: 'quick',
			label: 'Saved',
			conditions: [
				{ field: 'featured', value: true },
				{ field: 'search', value: 'mug' },
			],
			sort: { field: 'sortable_price', direction: 'desc' },
		},
	];
	mount();
	press('quick-filter-saved');
	fireEvent.contextMenu(screen.getByTestId('quick-filter-saved').querySelector('button')!);
	fireEvent.click(screen.getByTestId('filter-bar-menu-remove-saved'));
	expect(JSON.parse(screen.getByTestId('state').textContent!).search).toBe('mug');
	fireEvent.click(screen.getByTestId('filter-bar-delete-confirm'));
	expect(JSON.parse(screen.getByTestId('state').textContent!)).toMatchObject({
		search: '',
		filters: { status: 'publish', categories: [], tags: [], brands: [] },
		sort: { field: 'name', direction: 'asc' },
	});
	expect(JSON.parse(screen.getByTestId('state').textContent!).filters.featured).toBeUndefined();
});

it('lists lit visible pills and quick filters in bar order, excluding the place', () => {
	const state = {
		search: 'hat',
		filters: { categories: [1], tags: [], brands: [], featured: true },
		sort: { field: 'name', direction: 'asc' },
	} as const;
	const typed = state as unknown as Parameters<typeof activeConditions>[1];
	const quick = {
		id: 'hats',
		type: 'quick' as const,
		label: 'Hats',
		conditions: [
			{ field: 'search' as const, value: 'hat' },
			{ field: 'featured' as const, value: true },
			{ field: 'categories' as const, value: [1] },
		],
	};
	expect(
		activeConditions(
			[
				{ id: 'categories', type: 'pill', show: true },
				quick,
				{ id: 'featured', type: 'pill', show: true },
				{ id: 'tags', type: 'pill', show: true },
			],
			typed,
			{ filters: { categories: [], tags: [], brands: [] }, sort: typed.sort },
			{ field: 'categories' }
		).map((item) => item.id)
	).toEqual(['hats', 'featured']);
});
