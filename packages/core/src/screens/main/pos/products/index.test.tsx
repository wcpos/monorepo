/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { cellsForRow, POSProducts } from './index';
import { ProductImage } from '../../components/product/image';
import { VariableProductImage } from '../../components/product/variable-image';

import type { QueryStateOf } from '../../../../query';

const mockBinding = {
	resource: { kind: 'pos-products-resource' },
	active$: of(false),
	total$: of(40),
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
let mockGridColumns = 4;

jest.mock('../../../../query', () => {
	const actual = jest.requireActual('../../../../query');
	return {
		...actual,
		useRelationalCollectionBinding: (state: unknown) => mockUseRelationalCollectionBinding(state),
	};
});
jest.mock('@wcpos/query', () => ({
	useDocField: jest.requireActual('@wcpos/core-test/mock-use-doc-field').mockUseDocField,
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
			<>
				<button
					data-testid="clear-and-refresh"
					onClick={() => {
						actions.clearSearch();
						actions.resetFilters();
					}}
				/>
				<button
					data-testid="clear-stock-filter"
					onClick={() => actions.clearFilter('stock_status')}
				/>
			</>
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
// POSProducts imports the POS slot registrations for their side effect, which reaches the
// cart column and the quick-filter entry. Neither is under test here.
jest.mock('../cart', () => ({ OpenOrders: () => null }));
jest.mock('./quick-filters-bar', () => ({ QuickFiltersBar: () => null }));
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
			gridColumns$: mockGridColumns,
		},
	}),
}));
jest.mock('../../contexts/tax-rates', () => ({ useTaxSettings: () => ({ calcTaxes: false }) }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('./use-barcode', () => ({
	useBarcode: (setSearch: (search: string) => void, clearSearch: () => void) =>
		mockUseBarcode(setSearch, clearSearch),
}));
jest.mock('./storage-outage-banner', () => ({ StorageOutageBanner: () => null }));
jest.mock('./camera-scan-button', () => ({ CameraScanButton: () => null }));
jest.mock('./camera-scanner-panel', () => ({ CameraScannerPanel: () => null }));
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
jest.mock('../../components/record-text-cell', () => ({ RecordTextCell: () => null }));

function latestState(): QueryStateOf<'products'> {
	const call = mockUseRelationalCollectionBinding.mock.calls.at(-1);
	if (!call) throw new Error('POS products binding was not called');
	return call[0] as QueryStateOf<'products'>;
}

describe('cellsForRow', () => {
	it('selects variable cells only for variable products', () => {
		const row = (type: 'simple' | 'variable') =>
			({ original: { record: { payload: { type } } } }) as Parameters<typeof cellsForRow>[0];

		expect(cellsForRow(row('variable')).image).toBe(VariableProductImage);
		expect(cellsForRow(row('simple')).image).toBe(ProductImage);
	});
});

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
		mockGridColumns = 4;
	});

	it('binds table mode, barcode fallback, and the shared filter bar without a fluent Query', () => {
		render(<POSProducts />);

		expect(latestState()).toEqual({
			search: '',
			filters: {
				categories: [],
				tags: [],
				brands: [],
				stock_status: 'instock',
				status: 'publish',
			},
			sort: { field: 'name', direction: 'asc' },
			limit: 10,
		});
		expect(mockDataTableProps).toMatchObject({
			collectionName: 'products',
			resource: mockBinding.resource,
			sort: { field: 'name', direction: 'asc' },
			active$: mockBinding.active$,
			total$: mockBinding.total$,
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

	it('hands expanded variation rows the live filter, not the display setting', () => {
		render(<POSProducts />);

		const meta = () => (mockDataTableProps.tableConfig as { meta: Record<string, unknown> }).meta;
		const extraData = () => (mockDataTableProps.tableConfig as { extraData: unknown }).extraData;

		// The display setting seeds the pill, and the variation rows read the pill.
		expect(meta().variationStockStatus).toBe('instock');
		expect(extraData()).toBe('instock');

		// Clearing the pill widens the grid to every stock state; the variations under an
		// expanded row widen with it. Reading `showOutOfStock` instead left a cleared filter
		// bar showing 4 of a 20-colour product's variations (demo store, 2026-08-25).
		fireEvent.click(screen.getByTestId('clear-stock-filter'));
		expect(latestState().filters).not.toHaveProperty('stock_status');
		expect(meta().variationStockStatus).toBeUndefined();
		expect(extraData()).toBeUndefined();

		// And a narrowed pill narrows them: out-of-stock variations only.
		const actions = mockDataTableProps.actions as {
			setFilter: (field: 'stock_status', value: string) => void;
		};
		act(() => actions.setFilter('stock_status', 'outofstock'));
		expect(meta().variationStockStatus).toBe('outofstock');
		expect(extraData()).toBe('outofstock');
	});

	it('keeps custom variation detail expansion under screen ownership', () => {
		render(<POSProducts />);

		expect(mockDataTableProps.tableConfig).toMatchObject({ manualExpanding: true });
		expect(mockDataTableProps.cellsForRow).toEqual(expect.any(Function));
		expect(mockDataTableProps).not.toHaveProperty('renderCell');
	});

	it('maps showOutOfStock and runtime sort changes exactly onto products query state', () => {
		const { rerender } = render(<POSProducts />);
		expect(latestState().filters).toMatchObject({
			stock_status: 'instock',
			status: 'publish',
		});

		mockShowOutOfStock = true;
		mockSortBy = 'total_sales';
		mockSortDirection = 'desc';
		rerender(<POSProducts />);

		expect(latestState()).toMatchObject({
			filters: { categories: [], tags: [], brands: [], status: 'publish' },
			sort: { field: 'total_sales', direction: 'desc' },
		});
		expect(latestState().filters).not.toHaveProperty('stock_status');
	});

	it('rebases the reset baseline when showOutOfStock changes without remounting the store', () => {
		const { rerender } = render(<POSProducts />);
		expect(latestState().filters.stock_status).toBe('instock');

		const setSearch = mockUseBarcode.mock.calls[0]?.[0];
		act(() => setSearch?.('persisted term'));
		const actions = mockDataTableProps.actions as {
			extendLimit: () => void;
			setFilter: (field: 'stock_status', value: string) => void;
		};
		act(() => actions.extendLimit());

		mockShowOutOfStock = true;
		rerender(<POSProducts />);
		expect(latestState().filters).not.toHaveProperty('stock_status');
		// The store survives the toggle — committed search is preserved, where the
		// old remount key wiped search, sort, and pagination.
		expect(latestState().search).toBe('persisted term');
		expect(latestState().limit).toBe(20);

		mockShowOutOfStock = false;
		rerender(<POSProducts />);
		expect(latestState()).toMatchObject({ filters: { stock_status: 'instock' }, limit: 20 });

		mockShowOutOfStock = true;
		rerender(<POSProducts />);

		act(() => actions.setFilter('stock_status', 'outofstock'));
		fireEvent.click(screen.getByTestId('clear-and-refresh'));

		expect(latestState().filters).not.toHaveProperty('stock_status');
		expect(latestState().filters).toMatchObject({ status: 'publish' });
		expect(latestState().limit).toBe(10);
	});

	it('normalizes the persisted price column key to sortable_price', () => {
		mockSortBy = 'price';
		mockSortDirection = 'desc';

		render(<POSProducts />);

		expect(latestState().sort).toEqual({ field: 'sortable_price', direction: 'desc' });
	});

	it('falls back to the authored default (name asc — Paul 2026-08-19, reverses #810) when the persisted sort is invalid', () => {
		mockSortBy = 'not-a-sort-field';
		mockSortDirection = 'desc';

		render(<POSProducts />);

		expect(latestState().sort).toEqual({ field: 'name', direction: 'asc' });
	});

	// #947, Paul's ruling 2026-08-14: both product lists sort by type. This grid always let the
	// cashier click the Type header, but `type` was missing from the persisted-sort surface, so
	// the choice silently reverted to menu_order asc on the next mount.
	it('seeds a persisted type sort instead of reverting to catalog order (#947)', () => {
		mockSortBy = 'type';
		mockSortDirection = 'desc';

		render(<POSProducts />);

		expect(latestState().sort).toEqual({ field: 'type', direction: 'desc' });
	});

	it('keeps a user-selected name sort over the catalog-order default (#810)', () => {
		mockSortBy = 'name';
		mockSortDirection = 'desc';

		render(<POSProducts />);

		expect(latestState().sort).toEqual({ field: 'name', direction: 'desc' });
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
