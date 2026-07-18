/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { POSProducts } from './index';

import type { QueryStateOf } from '../../../../query';

const mockBinding = {
	resource: { kind: 'pos-products-resource' },
	active$: of(false),
	total$: of(40),
	totalSource$: of('coverage' as const),
	sync: jest.fn(async () => undefined),
};
const mockUseRelationalCollectionBinding = jest.fn((_state: unknown) => mockBinding);
const mockUseBarcode = jest.fn(
	(_setSearch: (search: string) => void, _clearSearch: () => void) => ({
		onKeyPress: jest.fn(),
	})
);
let mockDataTableProps: Record<string, unknown> = {};
let mockGridProps: Record<string, unknown> = {};
let mockFilterBarProps: Record<string, unknown> = {};
let mockShowOutOfStock = false;
let mockSortBy = 'name';
let mockSortDirection = 'asc';
let mockViewMode = 'table';

jest.mock('../../../../query', () => {
	const actual = jest.requireActual('../../../../query');
	return {
		...actual,
		useRelationalCollectionBinding: (state: unknown) => mockUseRelationalCollectionBinding(state),
	};
});
jest.mock('@wcpos/query', () => ({
	useRelationalQuery: () => {
		throw new Error('legacy POS relational query reached');
	},
}));
jest.mock('observable-hooks', () => ({
	useObservableEagerState: (value: unknown) => value,
	useObservableRef: (value: unknown) => [{ current: value }, of(value)],
}));
jest.mock('@wcpos/components/card', () => ({
	Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/vstack', () => ({
	VStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../components/data-table', () => ({
	DataTable: (props: Record<string, unknown>) => {
		const { useQueryStateActions } = jest.requireActual('../../../../query');
		const actions = useQueryStateActions();
		mockDataTableProps = props;
		return (
			<button
				data-testid="clear-and-refresh"
				onClick={() => {
					actions.clearSearch();
					actions.resetFilters();
				}}
			/>
		);
	},
	DataTableFooter: () => null,
	defaultRenderItem: jest.fn(),
}));
jest.mock('./grid', () => ({
	ProductGrid: (props: Record<string, unknown>) => {
		mockGridProps = props;
		return <div />;
	},
}));
jest.mock('../../components/product/filter-bar', () => ({
	FilterBar: (props: Record<string, unknown>) => {
		mockFilterBarProps = props;
		return null;
	},
}));
jest.mock('../../components/query-search-input', () => ({ QuerySearchInput: () => null }));
jest.mock('../../components/ui-settings', () => ({
	UISettingsDialog: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: {
			sortBy: mockSortBy,
			sortDirection: mockSortDirection,
			showOutOfStock: mockShowOutOfStock,
			sortBy$: mockSortBy,
			sortDirection$: mockSortDirection,
			showOutOfStock$: mockShowOutOfStock,
			viewMode$: mockViewMode,
		},
	}),
}));
jest.mock('../../contexts/tax-rates', () => ({ useTaxRates: () => ({ calcTaxes: false }) }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('./use-barcode', () => ({
	useBarcode: (setSearch: (search: string) => void, clearSearch: () => void) =>
		mockUseBarcode(setSearch, clearSearch),
}));
jest.mock('./engine-outage-banner', () => ({ EngineOutageBanner: () => null }));
jest.mock('./ui-settings-form', () => ({ UISettingsForm: () => null }));
jest.mock('./view-mode-toggle', () => ({ ViewModeToggle: () => null }));
jest.mock('./cells/actions', () => ({ Actions: () => null }));
jest.mock('./cells/cogs', () => ({ COGS: () => null }));
jest.mock('./cells/name', () => ({ Name: () => null }));
jest.mock('./cells/price', () => ({ Price: () => null }));
jest.mock('./cells/sku', () => ({ SKU: () => null }));
jest.mock('./cells/stock-quantity', () => ({ StockQuantity: () => null }));
jest.mock('./cells/variable-actions', () => ({ VariableActions: () => null }));
jest.mock('./cells/variation-actions', () => ({ ProductVariationActions: () => null }));
jest.mock('./cells/variation-name', () => ({ ProductVariationName: () => null }));
jest.mock('../../components/product/image', () => ({ ProductImage: () => null }));
jest.mock('../../components/product/tax-based-on', () => ({ TaxBasedOn: () => null }));
jest.mock('../../components/product/variable-image', () => ({ VariableProductImage: () => null }));
jest.mock('../../components/product/variable-price', () => ({ VariableProductPrice: () => null }));
jest.mock('../../components/product/variable-product-row', () => ({
	VariableProductRow: () => null,
}));
jest.mock('../../components/product/variation-image', () => ({
	ProductVariationImage: () => null,
}));
jest.mock('../../components/text-cell', () => ({ TextCell: () => null }));

function latestState(): QueryStateOf<'products'> {
	const call = mockUseRelationalCollectionBinding.mock.calls.at(-1);
	if (!call) throw new Error('POS products binding was not called');
	return call[0] as QueryStateOf<'products'>;
}

describe('POSProducts query-state wiring', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockDataTableProps = {};
		mockGridProps = {};
		mockFilterBarProps = {};
		mockShowOutOfStock = false;
		mockSortBy = 'name';
		mockSortDirection = 'asc';
		mockViewMode = 'table';
	});

	it('binds table mode, barcode fallback, and the shared filter bar without a fluent Query', () => {
		render(<POSProducts />);

		expect(latestState()).toEqual({
			search: '',
			filters: { categories: [], tags: [], brands: [], stock_status: 'instock' },
			sort: { field: 'name', direction: 'asc' },
			limit: 10,
		});
		expect(mockDataTableProps).toMatchObject({
			collectionName: 'products',
			resource: mockBinding.resource,
			sort: { field: 'name', direction: 'asc' },
			active$: mockBinding.active$,
			total$: mockBinding.total$,
			totalSource$: mockBinding.totalSource$,
			sync: mockBinding.sync,
		});
		expect(mockDataTableProps).not.toHaveProperty('query');
		expect(mockFilterBarProps).toEqual({});

		const setSearch = mockUseBarcode.mock.calls[0]?.[0];
		act(() => setSearch?.('ABC-123'));
		expect(latestState().search).toBe('ABC-123');
		const clearSearch = mockUseBarcode.mock.calls[0]?.[1];
		act(() => clearSearch?.());
		expect(latestState().search).toBe('');
	});

	it('maps showOutOfStock and runtime sort changes exactly onto products query state', () => {
		const { rerender } = render(<POSProducts />);
		expect(latestState().filters.stock_status).toBe('instock');

		mockShowOutOfStock = true;
		mockSortBy = 'total_sales';
		mockSortDirection = 'desc';
		rerender(<POSProducts />);

		expect(latestState()).toMatchObject({
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'total_sales', direction: 'desc' },
		});
		expect(latestState().filters).not.toHaveProperty('stock_status');
	});

	it('remounts the reset baseline when showOutOfStock changes', () => {
		const { rerender } = render(<POSProducts />);
		expect(latestState().filters.stock_status).toBe('instock');

		mockShowOutOfStock = true;
		rerender(<POSProducts />);
		expect(latestState().filters).not.toHaveProperty('stock_status');

		act(() => {
			const actions = mockDataTableProps.actions as {
				setFilter: (field: 'stock_status', value: string) => void;
			};
			actions.setFilter('stock_status', 'outofstock');
		});
		fireEvent.click(screen.getByTestId('clear-and-refresh'));

		expect(latestState().filters).not.toHaveProperty('stock_status');
	});

	it('normalizes the persisted price column key to sortable_price', () => {
		mockSortBy = 'price';
		mockSortDirection = 'desc';

		render(<POSProducts />);

		expect(latestState().sort).toEqual({ field: 'sortable_price', direction: 'desc' });
	});

	it('serves grid mode from the same binding and pagination action', () => {
		mockViewMode = 'grid';
		render(<POSProducts />);

		expect(mockGridProps).toMatchObject({ binding: mockBinding });
		const actions = mockGridProps.actions as { extendLimit: () => void };
		act(() => actions.extendLimit());
		expect(latestState().limit).toBe(20);
	});
});
