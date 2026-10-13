/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { ProductsScreen } from './index';
import { cellsForRow } from './products';
import { ProductImage } from '../components/product/image';
import { VariableProductImage } from '../components/product/variable-image';

import type { QueryStateOf } from '../../../query';

// The products query handle as a reader sees it (one snapshot, driven with `set`).
type FakeHandle = import('@wcpos/query').QueryHandle & {
	set(partial: Record<string, unknown>): void;
};
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => FakeHandle;
};
const answered = (hits: unknown[] = []) =>
	fakeQueryHandle({
		result: { hits, searchActive: false, searchState: 'answered' },
		total: 31,
	});
const productHit = (id: string) => ({
	id,
	record: { uuid: id, payload: { type: 'simple', slug: id } },
});
let mockHandle: FakeHandle = answered();
const mockUseProductsQueryHandle = jest.fn((_state: unknown) => mockHandle);
let mockDataTableProps: Record<string, unknown> = {};
let mockSortBy = 'name';
let mockSortDirection = 'asc';

jest.mock('../../../query', () => {
	const actual = jest.requireActual('../../../query');
	return {
		...actual,
		useProductsQueryHandle: (state: unknown) => mockUseProductsQueryHandle(state),
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
// The real boundary with a reset control: the screen wires `onReset` to the handle's retry.
jest.mock('@wcpos/components/error-boundary', () => {
	const { ErrorBoundary } = jest.requireActual('react-error-boundary');
	return {
		ErrorBoundary: ({
			children,
			onReset,
			resetKeys,
		}: {
			children: React.ReactNode;
			onReset?: () => void;
			resetKeys?: unknown[];
		}) => (
			<ErrorBoundary
				onReset={onReset}
				resetKeys={resetKeys}
				fallbackRender={({ resetErrorBoundary }: { resetErrorBoundary: () => void }) => (
					<button data-testid="products-error-reset" onClick={() => resetErrorBoundary()} />
				)}
			>
				{children}
			</ErrorBoundary>
		),
	};
});
jest.mock('@wcpos/components/suspense', () => ({ Suspense: React.Suspense }));
jest.mock('../components/data-table/v2', () => ({
	DataTable: (props: Record<string, unknown>) => {
		mockDataTableProps = props;
		// The real handle source's reader: draws the deferred handle's rows, suspends on an
		// unanswered one, throws a failure to the boundary.
		const actual = jest.requireActual('../../../query');
		const shown = actual.useDrawnHandle(props.handle);
		const snapshot = actual.useQuerySnapshot(shown, []);
		const renderItem = props.renderItem as (args: {
			item: { original: unknown };
			index: number;
			table: unknown;
		}) => React.ReactNode;
		return (
			<div data-testid="products-table">
				{(snapshot.result.hits as { record: { uuid: string } }[]).map((hit, index) => (
					<React.Fragment key={hit.record.uuid}>
						{renderItem({ item: { original: hit }, index, table: {} })}
					</React.Fragment>
				))}
				{props.noDataMessage as React.ReactNode}
			</div>
		);
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
	const call = mockUseProductsQueryHandle.mock.calls.at(-1);
	if (!call) throw new Error('products handle was not asked for');
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

	it('reads the admin grid through the relational products handle', () => {
		render(<ProductsScreen />);

		expect(latestState()).toEqual({
			search: '',
			filters: { status: 'publish', categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 10,
		});
		expect(mockDataTableProps).toMatchObject({
			handle: mockHandle,
			sort: { field: 'name', direction: 'asc' },
		});
		expect(mockDataTableProps).not.toHaveProperty('query');
		expect(mockDataTableProps).not.toHaveProperty('resource');
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
it('renders the skeleton inside the guard while the handle is unanswered and the bar remains reachable', () => {
	const original = mockHandle;
	mockHandle = fakeQueryHandle({ ready: false });
	try {
		render(<ProductsScreen />);
		expect(screen.getByTestId('skeleton-products')).toBeTruthy();
		expect(screen.queryByTestId('products-table')).toBeNull();
		expect(screen.getByTestId('products-bar')).toBeTruthy();
		expect(screen.getByTestId('pro-body').contains(screen.getByTestId('products-body'))).toBe(true);
		expect(screen.getByTestId('pro-body').contains(screen.getByTestId('products-bar'))).toBe(false);
	} finally {
		mockHandle = original;
	}
});
it('keeps the current rows, not the skeleton, while a changed query’s handle answers, then shows its rows', async () => {
	const original = mockHandle;
	mockHandle = answered([productHit('one')]);
	try {
		render(<ProductsScreen />);
		expect(screen.getByTestId('products-row-one')).toBeTruthy();
		// The query changes (a header sort): the screen asks for a new handle, unanswered.
		const next = fakeQueryHandle({ ready: false });
		mockHandle = next;
		act(() =>
			(
				mockDataTableProps.actions as { setSort: (field: string, direction: string) => void }
			).setSort('stock_status', 'desc')
		);
		expect(latestState().sort).toEqual({ field: 'stock_status', direction: 'desc' });
		// The old rows stay; no skeleton.
		expect(screen.getByTestId('products-row-one')).toBeTruthy();
		expect(screen.queryByTestId('skeleton-products')).toBeNull();
		await act(async () =>
			next.set({
				ready: true,
				result: { hits: [productHit('two')], searchActive: false, searchState: 'answered' },
			})
		);
		expect(screen.getByTestId('products-row-two')).toBeTruthy();
		expect(screen.queryByTestId('products-row-one')).toBeNull();
	} finally {
		mockHandle = original;
	}
});
it('throws a failed read to the boundary, whose reset asks the handle again and draws its answer', async () => {
	const original = mockHandle;
	const failed = fakeQueryHandle({ ready: false, error: new Error('read failed') });
	const retry = jest.fn(() => {
		failed.set({ error: null, ready: false });
	});
	failed.retry = retry;
	mockHandle = failed;
	const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
	try {
		render(<ProductsScreen />);
		expect(screen.getByTestId('products-error-reset')).toBeTruthy();
		expect(screen.queryByTestId('products-table')).toBeNull();
		// The reset retries through the handle; the reader suspends on the retry.
		act(() => {
			fireEvent.click(screen.getByTestId('products-error-reset'));
		});
		expect(retry).toHaveBeenCalledTimes(1);
		expect(screen.getByTestId('skeleton-products')).toBeTruthy();
		await act(async () =>
			failed.set({
				ready: true,
				result: { hits: [productHit('one')], searchActive: false, searchState: 'answered' },
			})
		);
		expect(screen.getByTestId('products-row-one')).toBeTruthy();
	} finally {
		consoleError.mockRestore();
		mockHandle = original;
	}
});

jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('../components/data-table/v2/rows', () => ({
	DataTableRow: ({ item }: { item: { original: { record: { uuid: string } } } }) => (
		<div data-testid={`products-row-${item.original.record.uuid}`} />
	),
}));

jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));

it('shows the searching line only while a pending search retains rows', () => {
	const original = mockHandle;
	const source = { hits: [productHit('one')], searchActive: true, searchState: 'pending' };
	mockHandle = fakeQueryHandle({ result: source, total: 31 });
	try {
		render(<ProductsScreen />);
		expect(screen.getByTestId('products-searching-line')).toBeTruthy();
		act(() => mockHandle.set({ result: { ...source, searchState: 'answered' } }));
		expect(screen.queryByTestId('products-searching-line')).toBeNull();
	} finally {
		mockHandle = original;
	}
});

// A superseded handle's failure must not reach the boundary over a healthy query: the reader
// moves on to the live handle (the skeleton while it answers), then draws its rows.
it('shows the skeleton, not the failure, when a superseded handle fails, then the new rows', async () => {
	const original = mockHandle;
	const first = answered([productHit('one')]);
	mockHandle = first;
	const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
	try {
		render(<ProductsScreen />);
		expect(screen.getByTestId('products-row-one')).toBeTruthy();
		const next = fakeQueryHandle({ ready: false });
		mockHandle = next;
		act(() =>
			(
				mockDataTableProps.actions as { setSort: (field: string, direction: string) => void }
			).setSort('stock_status', 'desc')
		);
		expect(screen.getByTestId('products-row-one')).toBeTruthy();
		// The drawn (previous) handle fails while the new one is still loading.
		act(() => first.set({ error: new Error('superseded read failed') }));
		expect(screen.queryByTestId('products-error-reset')).toBeNull();
		expect(screen.getByTestId('skeleton-products')).toBeTruthy();
		await act(async () =>
			next.set({
				ready: true,
				result: { hits: [productHit('two')], searchActive: false, searchState: 'answered' },
			})
		);
		expect(screen.getByTestId('products-row-two')).toBeTruthy();
		expect(screen.queryByTestId('skeleton-products')).toBeNull();
	} finally {
		consoleError.mockRestore();
		mockHandle = original;
	}
});
