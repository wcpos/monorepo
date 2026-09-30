/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { POSFilterBar } from './filter-bar';
import { QueryStateProvider, useQueryState, useQueryStateActions } from '../../../../../query';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@wcpos/query', () => ({
	useDocField: (_: unknown, select: (value: object) => unknown) =>
		select({ showOutOfStock: true, sortBy: 'name', sortDirection: 'asc' }),
}));
jest.mock('../../../contexts/ui-settings', () => ({ useUISettings: () => ({ uiSettings: {} }) }));
jest.mock('../../../hooks/use-engine-document', () => ({
	useEngineRecordsByWooId: (_field: string, ids: number[]) =>
		ids.map((id) => ({ payload: { name: id === 1 ? 'Drinks' : 'Food' } })),
}));
jest.mock('observable-hooks', () => ({ useObservableSuspense: (value: unknown) => value }));
jest.mock('../../../hooks/use-stock-status-label', () => ({
	useStockStatusLabel: () => ({
		items: [
			{ value: 'instock', label: 'In stock' },
			{ value: 'outofstock', label: 'Out of stock' },
		],
	}),
}));
jest.mock('../../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
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
	}: {
		label: string;
		count?: number;
		on?: boolean;
		dimmed?: boolean;
		testID: string;
		clearTestID?: string;
		onPress: () => void;
		onClear?: () => void;
	}) => (
		<div data-testid={testID} data-on={!!on} data-dimmed={!!dimmed}>
			<button disabled={dimmed} onClick={onPress}>
				{label}
				{count !== undefined && ` +${count}`}
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
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
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
jest.mock('../../../components/product/category-select', () => ({
	CategoryTreeLoader: () => null,
}));
jest.mock('../../../components/product/tag-select', () => ({ TagSearch: () => null }));
jest.mock('../../../components/product/brand-select', () => ({ BrandSearch: () => null }));
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

jest.mock('uuid', () => ({ v4: () => 'test-id' }));
