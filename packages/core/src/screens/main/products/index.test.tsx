/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { ObservableResource } from 'observable-hooks';

import { ProductsScreen } from './index';
import { cellsForRow } from './products';
import { ProductImage } from '../components/product/image';
import { VariableProductImage } from '../components/product/variable-image';

import type { QueryStateOf } from '../../../query';

const mockBinding = {
	resource: new ObservableResource(
		new BehaviorSubject({ hits: [], searchActive: false, searchState: 'answered' })
	),
	active$: of(false),
	total$: of(31),
	sync: jest.fn(async () => undefined),
};
const mockUseRelationalCollectionBinding = jest.fn((_state: unknown) => mockBinding);
let mockDataTableProps: Record<string, unknown> = {};
let mockSortBy = 'name';
let mockSortDirection = 'asc';

jest.mock('../../../query', () => {
	const actual = jest.requireActual('../../../query');
	return {
		...actual,
		useRelationalCollectionBinding: (state: unknown) => mockUseRelationalCollectionBinding(state),
	};
});
jest.mock('@wcpos/query', () => ({
	useRelationalQuery: () => {
		throw new Error('legacy useRelationalQuery reached');
	},
}));
jest.mock('react-native-safe-area-context', () => ({
	useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@wcpos/components/input', () => ({
	Input: ({
		value,
		onChangeText,
		testID,
	}: {
		value: string;
		onChangeText: (value: string) => void;
		testID?: string;
	}) => (
		<input
			data-testid={testID}
			value={value}
			onChange={(event) => onChangeText(event.currentTarget.value)}
		/>
	),
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
jest.mock('@wcpos/components/suspense', () => ({ Suspense: React.Suspense }));
jest.mock('../components/data-table/v2', () => ({
	DataTable: (props: Record<string, unknown>) => {
		mockDataTableProps = props;
		return <div data-testid="products-table">{props.noDataMessage as React.ReactNode}</div>;
	},
	DataTableFooter: () => null,
	defaultRenderItem: jest.fn(),
}));
jest.mock('../components/data-table/v2/skeleton', () => ({
	DataTableSkeleton: () => <div data-testid="skeleton-products" />,
}));
jest.mock('../components/ui-settings', () => ({
	UISettingsDialog: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: { sortBy: mockSortBy, sortDirection: mockSortDirection },
	}),
}));
jest.mock('../contexts/tax-rates', () => ({
	TaxRatesProvider: ({ children }: { children: React.ReactNode }) => {
		const React = jest.requireActual('react');
		const { QueryStateProvider } = jest.requireActual('../../../query');
		return React.createElement(
			QueryStateProvider,
			{
				collection: 'tax-rates',
				initialPageSize: 10,
				initialSort: { field: 'id', direction: 'asc' },
			},
			children
		);
	},
	useTaxSettings: () => ({ calcTaxes: false }),
}));
jest.mock('../hooks/mutations/use-mutation', () => ({
	useMutation: () => ({ patch: jest.fn() }),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('./use-barcode', () => ({ useBarcode: jest.fn(() => ({ onKeyPress: jest.fn() })) }));
jest.mock('../components/product/filter-bar', () => ({ FilterBar: () => null }));
jest.mock('./ui-settings-form', () => ({ UISettingsForm: () => null }));
jest.mock('./cells/actions', () => ({ Actions: () => null }));
jest.mock('./cells/barcode', () => ({ Barcode: () => null }));
jest.mock('./cells/cogs', () => ({ COGS: () => null }));
jest.mock('./cells/editable-price', () => ({ EditablePrice: () => null }));
jest.mock('./cells/name', () => ({ ProductName: () => null }));
jest.mock('./cells/price', () => ({ Price: () => null }));
jest.mock('./cells/stock-quantity', () => ({ StockQuantity: () => null }));
jest.mock('./cells/stock-status', () => ({ StockStatus: () => null }));
jest.mock('./cells/variation-actions', () => ({ VariationActions: () => null }));
jest.mock('./cells/variation-name', () => ({ ProductVariationName: () => null }));
jest.mock('../components/record-date-cell', () => ({ RecordDateCell: () => null }));
jest.mock('../components/product/brands', () => ({ ProductBrands: () => null }));
jest.mock('../components/product/categories', () => ({ ProductCategories: () => null }));
jest.mock('../components/product/image', () => ({ ProductImage: () => null }));
jest.mock('../components/product/tags', () => ({ ProductTags: () => null }));
jest.mock('../components/product/tax-based-on', () => ({ TaxBasedOn: () => null }));
jest.mock('../components/product/variable-image', () => ({ VariableProductImage: () => null }));
jest.mock('../components/product/variable-price', () => ({ VariableProductPrice: () => null }));
jest.mock('../components/product/variable-product-row', () => ({ VariableProductRow: () => null }));
jest.mock('../components/product/variation-image', () => ({ ProductVariationImage: () => null }));
jest.mock('../components/record-text-cell', () => ({ RecordTextCell: () => null }));

function latestState(): QueryStateOf<'products'> {
	const call = mockUseRelationalCollectionBinding.mock.calls.at(-1);
	if (!call) throw new Error('relational products binding was not called');
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

describe('ProductsScreen query-state wiring', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		mockDataTableProps = {};
		mockSortBy = 'name';
		mockSortDirection = 'asc';
	});

	afterEach(() => jest.useRealTimers());

	it('binds the admin grid through the relational products binding', () => {
		render(<ProductsScreen />);

		expect(latestState()).toEqual({
			search: '',
			filters: { status: 'publish', categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 10,
		});
		expect(mockDataTableProps).toMatchObject({
			resource: mockBinding.resource,
			sort: { field: 'name', direction: 'asc' },
			active$: mockBinding.active$,
			total$: mockBinding.total$,
			sync: mockBinding.sync,
		});
		expect(mockDataTableProps).not.toHaveProperty('query');
	});

	it('keeps custom variation detail expansion under screen ownership', () => {
		render(<ProductsScreen />);

		expect(mockDataTableProps.tableConfig).toMatchObject({ manualExpanding: true });
		expect(mockDataTableProps.cellsForRow).toEqual(expect.any(Function));
		expect(mockDataTableProps).not.toHaveProperty('renderCell');
	});

	it('commits search, sort, and pagination through products query state', () => {
		render(<ProductsScreen />);

		fireEvent.change(screen.getByTestId('search-products'), { target: { value: 'hoodie' } });
		expect(latestState().search).toBe('');
		act(() => jest.advanceTimersByTime(250));
		expect(latestState().search).toBe('hoodie');

		const actions = mockDataTableProps.actions as {
			setSort: (field: 'stock_status', direction: 'desc') => void;
			extendLimit: () => void;
		};
		act(() => actions.extendLimit());
		expect(latestState().limit).toBe(20);
		act(() => actions.setSort('stock_status', 'desc'));
		expect(latestState()).toMatchObject({
			sort: { field: 'stock_status', direction: 'desc' },
			limit: 10,
		});
	});

	it('seeds valid persisted sort and rejects fields outside the products sort surface', () => {
		mockSortBy = 'price';
		mockSortDirection = 'desc';
		const { unmount } = render(<ProductsScreen />);
		expect(latestState().sort).toEqual({ field: 'sortable_price', direction: 'desc' });
		unmount();

		mockSortBy = 'not_a_product_field';
		mockSortDirection = 'asc';
		render(<ProductsScreen />);
		expect(latestState().sort).toEqual({ field: 'name', direction: 'asc' });
	});

	// #947, Paul's ruling 2026-08-14: both product lists sort by type. `type` used to be this
	// screen's example of a field OUTSIDE the sort surface — the column carried `disableSort`
	// and a persisted `sortBy: 'type'` silently reverted to name asc on the next mount. It is
	// a first-class (locally-served) sort now, so the seed has to survive the round trip.
	it('seeds a persisted type sort instead of reverting it (#947)', () => {
		mockSortBy = 'type';
		mockSortDirection = 'desc';
		render(<ProductsScreen />);
		expect(latestState().sort).toEqual({ field: 'type', direction: 'desc' });
	});
});

it('keeps the management bar outside the Pro body and never invents an add button', () => {
	render(<ProductsScreen />);
	const bar = screen.getByTestId('products-bar');
	const body = screen.getByTestId('products-body');
	expect(body.contains(bar)).toBe(false);
	expect(screen.queryByTestId('products-add-button')).toBeNull();
});

jest.mock('expo-haptics', () => ({}));
jest.mock('../components/management-bar', () => ({
	ManagementBar: ({
		children,
		search,
		testID,
	}: React.PropsWithChildren<{ search: React.ReactNode; testID: string }>) => (
		<div data-testid={testID}>
			{search}
			{children}
		</div>
	),
}));
jest.mock('../components/display-options', () => ({ DisplayOptions: () => null }));
jest.mock('../components/pro-guard', () => ({
	withProAccess: (Body: React.ComponentType) =>
		function Guard() {
			return (
				<div data-testid="pro-body">
					<Body />
				</div>
			);
		},
}));
jest.mock('@wcpos/components/lib/device', () => ({ usePointer: () => 'fine' }));
jest.mock('./row', () => ({ ProductRow: () => null, VariableRow: () => null }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Item: ({ children }: React.PropsWithChildren) => children,
}));
it('shows an empty store and clears both search and filters from no results', () => {
	jest.useFakeTimers();
	render(<ProductsScreen />);
	expect(screen.getByTestId('no-data-message').textContent).toContain('products.no_products_yet');
	const actions = mockDataTableProps.actions as {
		setFilter: (key: string, value: unknown) => void;
	};
	act(() => actions.setFilter('featured', true));
	fireEvent.change(screen.getByTestId('search-products'), { target: { value: 'missing' } });
	act(() => jest.advanceTimersByTime(250));
	expect(screen.getByTestId('no-data-message').textContent).toContain(
		'pos_products.nothing_matches_filters'
	);
	fireEvent.click(screen.getByText('pos_products.clear_filters'));
	expect(latestState().search).toBe('');
	expect(latestState().filters).toEqual({
		status: 'publish',
		categories: [],
		tags: [],
		brands: [],
	});
	jest.useRealTimers();
});
it('renders the skeleton inside the guard while the bar remains reachable', () => {
	const resource = mockBinding.resource;
	mockBinding.resource = new ObservableResource(new Subject());
	render(<ProductsScreen />);
	expect(screen.getByTestId('skeleton-products')).toBeTruthy();
	expect(screen.getByTestId('products-bar')).toBeTruthy();
	expect(screen.getByTestId('pro-body').contains(screen.getByTestId('products-body'))).toBe(true);
	expect(screen.getByTestId('pro-body').contains(screen.getByTestId('products-bar'))).toBe(false);
	mockBinding.resource = resource;
});

jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('../components/data-table/v2/rows', () => ({ DataTableRow: () => null }));

jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));

it('shows the searching line only while a pending search retains rows', () => {
	const resource = mockBinding.resource;
	const results = new BehaviorSubject({
		hits: [{} as never],
		searchActive: true,
		searchState: 'pending',
	});
	mockBinding.resource = new ObservableResource(results);
	render(<ProductsScreen />);
	expect(screen.getByTestId('products-searching-line')).toBeTruthy();
	act(() => results.next({ hits: [], searchActive: true, searchState: 'answered' }));
	expect(screen.queryByTestId('products-searching-line')).toBeNull();
	mockBinding.resource = resource;
});
