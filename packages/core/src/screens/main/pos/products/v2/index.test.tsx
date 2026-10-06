/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { cellsForRow, POSProducts } from './index';
import { ProductImage } from '../../../components/product/image';
import { VariableProductImage } from '../../../components/product/variable-image';

import type { QueryStateOf } from '../../../../../query';

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
let mockBrowseStageProps: Record<string, unknown> | null = null;
let mockBrowseStageMounts = 0;
let mockScopeKey = '0:0';
let mockShowOutOfStock = false;
let mockSortBy = 'name';
let mockSortDirection = 'asc';
let mockViewMode = 'table';
let mockGridColumns = 4;
let mockBrowseBy: string | undefined;
let mockSession: { status: string } | null = null;
let mockSessionsOn = false;

// The state primitives pull in Button (expo-haptics) and Icon (uniwind), both ESM-only under
// jest; the doubles keep the props this screen reads.
jest.mock('@wcpos/components/empty-state', () => ({
	EmptyState: ({
		title,
		description,
		testID,
	}: {
		title: string;
		description?: string;
		testID?: string;
	}) => (
		<section data-testid={testID}>
			<h2>{title}</h2>
			{description ? <p>{description}</p> : null}
		</section>
	),
}));
jest.mock('@wcpos/components/skeleton', () => ({
	Skeleton: ({ shape }: { shape?: string }) => <div data-testid="skeleton" data-shape={shape} />,
	skeletonCount: () => 3,
	SKELETON_MAX_ROWS: 12,
}));
jest.mock('../../../../../services/register-session/use-register-session', () => ({
	useRegisterSession: () => ({ session: mockSession, sessionsOn: mockSessionsOn }),
}));
jest.mock('../../../../../query', () => {
	const actual = jest.requireActual('../../../../../query');
	return {
		...actual,
		useRelationalCollectionBinding: (state: unknown) => mockUseRelationalCollectionBinding(state),
		useScopeKey: () => mockScopeKey,
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
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/text', () => ({
	Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
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
jest.mock('../../../components/data-table/v2', () => ({
	DataTable: (props: Record<string, unknown>) => {
		const { useQueryStateActions } = jest.requireActual('../../../../../query');
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
jest.mock('../grid', () => ({
	ProductGrid: (props: Record<string, unknown>) => {
		mockGridProps = props;
		return <div />;
	},
}));
jest.mock('./filter-bar', () => ({
	POSFilterBar: (props: Record<string, unknown>) => {
		mockFilterBarProps = props;
		return null;
	},
}));
jest.mock('../../../components/query-search-input', () => ({ QuerySearchInput: () => null }));
jest.mock('../../../components/ui-settings', () => ({
	UISettingsDialog: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../../contexts/ui-settings', () => ({
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
			browseBy$: mockBrowseBy,
		},
	}),
}));
jest.mock('../../../contexts/tax-rates', () => ({ useTaxSettings: () => ({ calcTaxes: false }) }));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../use-barcode', () => ({
	useBarcode: (setSearch: (search: string) => void, clearSearch: () => void) =>
		mockUseBarcode(setSearch, clearSearch),
}));
jest.mock('../storage-outage-banner', () => ({ StorageOutageBanner: () => null }));
jest.mock('../camera-scan-button', () => ({ CameraScanButton: () => null }));
jest.mock('../camera-scanner-panel', () => ({ CameraScannerPanel: () => null }));
jest.mock('../ui-settings-form', () => ({ UISettingsForm: () => null }));
jest.mock('../view-mode-toggle', () => ({ ViewModeToggle: () => null }));
jest.mock('../cells/actions', () => ({ Actions: () => null }));
jest.mock('../cells/cogs', () => ({ COGS: () => null }));
jest.mock('../cells/name', () => ({ Name: () => null }));
jest.mock('../cells/price', () => ({ Price: () => null }));
jest.mock('../cells/sku', () => ({ SKU: () => null }));
jest.mock('../cells/stock-quantity', () => ({ StockQuantity: () => null }));
jest.mock('../cells/variable-actions', () => ({ VariableActions: () => null }));
jest.mock('../cells/variation-actions', () => ({ ProductVariationActions: () => null }));
jest.mock('../cells/variation-name', () => ({ ProductVariationName: () => null }));
jest.mock('../../../components/product/image', () => ({ ProductImage: () => null }));
jest.mock('../../../components/product/tax-based-on', () => ({ TaxBasedOn: () => null }));
jest.mock('../../../components/product/variable-image', () => ({
	VariableProductImage: () => null,
}));
jest.mock('../../../components/product/variable-price', () => ({
	VariableProductPrice: () => null,
}));
jest.mock('../../../components/product/variable-product-row', () => ({
	VariableProductRow: () => null,
}));
jest.mock('../../../components/product/variation-image', () => ({
	ProductVariationImage: () => null,
}));
jest.mock('../../../components/record-text-cell', () => ({ RecordTextCell: () => null }));

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
		mockBrowseStageProps = null;
		mockBrowseStageMounts = 0;
		mockScopeKey = '0:0';
		mockBrowseBy = undefined;
		mockShowOutOfStock = false;
		mockSortBy = 'name';
		mockSortDirection = 'asc';
		mockViewMode = 'table';
		mockGridColumns = 4;
		mockSession = null;
		mockSessionsOn = false;
	});

	it('shows price-check guidance only before a session opens with sessions enabled', () => {
		mockSessionsOn = true;
		const { rerender } = render(<POSProducts />);
		expect(screen.getByTestId('products-locked-notice').textContent).toBe(
			'pos_products.price_check_only_until_open'
		);
		mockSession = { status: 'open' };
		rerender(<POSProducts />);
		expect(screen.queryByText('pos_products.price_check_only_until_open')).toBeNull();
		mockSession = null;
		mockSessionsOn = false;
		rerender(<POSProducts />);
		expect(screen.queryByText('pos_products.price_check_only_until_open')).toBeNull();
	});

	it('shows counting guidance instead of price-check guidance while counting', () => {
		mockSessionsOn = true;
		mockSession = { status: 'counting' };
		const { rerender } = render(<POSProducts />);
		expect(screen.getByText('pos_products.counting_items_after_count')).toBeTruthy();
		expect(screen.queryByText('pos_products.price_check_only_until_open')).toBeNull();
		mockSession = { status: 'open' };
		rerender(<POSProducts />);
		expect(screen.queryByText('pos_products.counting_items_after_count')).toBeNull();
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
		expect(mockFilterBarProps).toEqual({
			level: 'products',
			initialFilters: { status: 'publish', stock_status: 'instock' },
		});

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
		// Tiles drill in on the deal stage; rows keep the sliding pane.
		expect(document.querySelector('[data-testid="deal-stage"]')).not.toBeNull();
		const actions = mockGridProps.actions as { extendLimit: () => void };
		act(() => actions.extendLimit());
		expect(latestState().limit).toBe(20);
	});

	it('puts the browse stage in place of the products in a browse mode', () => {
		mockBrowseBy = 'categories';
		render(<POSProducts />);
		expect(mockBrowseStageProps).toMatchObject({ source: 'categories', viewMode: 'table' });
		expect(screen.queryByTestId('products-pane-stack')).toBeNull();
		// The filter bar is the same in every mode.
		expect(mockFilterBarProps).toEqual({
			level: 'products',
			initialFilters: { status: 'publish', stock_status: 'instock' },
		});
	});

	it('hands the browse stage the screen’s plumbing, and its drill sets the filter bar’s level', () => {
		mockBrowseBy = 'categories';
		render(<POSProducts />);
		expect(mockBrowseStageProps).toMatchObject({
			binding: mockBinding,
			// The baseline its root measures the query against (term set, or displaced products).
			initialFilters: { status: 'publish', stock_status: 'instock' },
			variationsStyle: 'drill',
			stockStatus: 'instock',
			state: expect.objectContaining({ sort: { field: 'name', direction: 'asc' } }),
			actions: expect.objectContaining({ extendLimit: expect.any(Function) }),
			tableConfig: expect.objectContaining({
				meta: expect.objectContaining({ variationStockStatus: 'instock' }),
			}),
		});
		expect(screen.queryByTestId('no-data-message')).toBeNull();
		render(mockBrowseStageProps?.empty as React.ReactElement);
		expect(screen.getByTestId('no-data-message')).toBeTruthy();

		const onDrilledChange = mockBrowseStageProps?.onDrilledChange as (drilled: boolean) => void;
		act(() => onDrilledChange(true));
		expect(mockFilterBarProps.level).toBe('variations');
		act(() => onDrilledChange(false));
		expect(mockFilterBarProps.level).toBe('products');
	});

	// The stage owns search: it drops its path and shows the catalogue-wide products itself, so
	// a search never swaps the stage out (a shortcut's own search would bounce it otherwise).
	it('keeps the browse stage, not the products stack, under a search', () => {
		mockBrowseBy = 'categories';
		render(<POSProducts />);
		mockBrowseStageProps = null;
		act(() => mockUseBarcode.mock.calls[0]?.[0]?.('lat'));
		expect(latestState().search).toBe('lat');
		expect(mockBrowseStageProps).toMatchObject({ source: 'categories' });
		expect(screen.queryByTestId('products-pane-stack')).toBeNull();
	});

	it('drops a product drill when a browse source takes over, and does not bring it back', () => {
		mockViewMode = 'grid';
		const { rerender } = render(<POSProducts />);
		const VariableTile = mockGridProps.variableTile as (props: object) => React.ReactElement<{
			onDrill: (record: unknown) => void;
		}>;
		act(() => VariableTile({}).props.onDrill({ uuid: 'hoodie', payload: { type: 'variable' } }));
		expect(mockFilterBarProps.level).toBe('variations');

		mockBrowseBy = 'categories';
		rerender(<POSProducts />);
		expect(mockFilterBarProps.level).toBe('products');

		mockBrowseBy = undefined;
		rerender(<POSProducts />);
		expect(mockFilterBarProps.level).toBe('products');
	});

	// A same-site store or cashier switch keeps the source, search, filters and path, and changes
	// the database the products are read from: the stage's drill and held answers are stale.
	it('remounts the browse stage when the scope changes, and only then', () => {
		mockBrowseBy = 'categories';
		const { rerender } = render(<POSProducts />);
		expect(mockBrowseStageMounts).toBe(1);
		rerender(<POSProducts />);
		expect(mockBrowseStageMounts).toBe(1);

		mockScopeKey = '0:1';
		rerender(<POSProducts />);
		expect(mockBrowseStageMounts).toBe(2);
		expect(mockBrowseStageProps).toMatchObject({ source: 'categories' });
	});

	it('drops a product drill when the scope changes', () => {
		mockViewMode = 'grid';
		const { rerender } = render(<POSProducts />);
		const VariableTile = mockGridProps.variableTile as (props: object) => React.ReactElement<{
			onDrill: (record: unknown) => void;
		}>;
		act(() => VariableTile({}).props.onDrill({ uuid: 'hoodie', payload: { type: 'variable' } }));
		expect(mockFilterBarProps.level).toBe('variations');

		mockScopeKey = '0:1';
		rerender(<POSProducts />);
		expect(mockFilterBarProps.level).toBe('products');
	});
});

// The new rows and tiles are tested in their own suites.
jest.mock('./rows/product-row', () => ({ ProductRow: () => null }));
jest.mock('./rows/variable-product-row', () => ({ VariableProductRow: () => null }));
jest.mock('./grid/product-tile', () => ({ ProductTile: () => null }));
jest.mock('./grid/variable-product-tile', () => ({ VariableProductTile: () => null }));
jest.mock('./drill-in', () => ({ DrillIn: () => <div data-testid="drill-in" /> }));
// Browse by is off unless a test stores it (no value reads as All products); the stage has its
// own suite, so here it only reports what it was handed.
jest.mock('./browse/browse-stage', () => ({
	BrowseStage: (props: Record<string, unknown>) => {
		mockBrowseStageProps = props;
		// A mount is a fresh stage: its drill, held answers and snapshots start empty.
		const { useEffect } = jest.requireActual('react');
		useEffect(() => {
			mockBrowseStageMounts += 1;
		}, []);
		return null;
	},
}));
// The stage's own behaviour is tested beside it; here it only has to hold both panes.
jest.mock('@wcpos/components/pane-stack', () => ({
	PaneStack: <T,>({
		children,
		detail,
		renderDetail,
		testID,
	}: React.PropsWithChildren<{
		detail: T | null;
		renderDetail: (detail: T) => React.ReactNode;
		testID?: string;
	}>) => (
		<div data-testid={testID}>
			{children}
			{detail !== null && renderDetail(detail)}
		</div>
	),
}));
jest.mock('./deal-stack', () => ({
	DealStack: ({ children }: React.PropsWithChildren) => (
		<div data-testid="deal-stage">{children}</div>
	),
	useCopyPicture: () => undefined,
}));
jest.mock('./footer', () => ({ ProductsFooter: () => null }));
jest.mock('@wcpos/components/lib/motion', () => ({ PANE: 280, EASE: (n: number) => n }));

// cellsForRow is reused from the old screen; its unrelated runtime surfaces stay out of this test.
jest.mock('../filter-bar/pos-filter-bar', () => ({ POSFilterBar: () => null }));
jest.mock('../../../components/data-table', () => ({ defaultRenderItem: jest.fn() }));
jest.mock('../../contexts/overlay-side', () => ({ useOverlaySide: () => 'right' }));

jest.mock('../../../components/data-table/v2/skeleton', () => ({
	DataTableSkeleton: () => <div data-testid="table-skeleton" />,
}));
