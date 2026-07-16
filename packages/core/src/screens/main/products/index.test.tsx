/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { ProductsScreen } from './index';

import type { QueryStateOf } from '../../../query';

const mockBinding = {
	resource: { kind: 'relational-products-resource' },
	active$: of(false),
	total$: of(31),
	totalSource$: of('coverage' as const),
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
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../components/data-table', () => ({
	DataTable: (props: Record<string, unknown>) => {
		mockDataTableProps = props;
		return <div data-testid="products-table" />;
	},
	DataTableFooter: () => null,
	defaultRenderItem: jest.fn(),
}));
jest.mock('../components/data-table/skeleton', () => ({ DataTableSkeleton: () => null }));
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
	useTaxRates: () => ({ calcTaxes: false }),
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
jest.mock('../components/date', () => ({ DateCell: () => null }));
jest.mock('../components/product/brands', () => ({ ProductBrands: () => null }));
jest.mock('../components/product/categories', () => ({ ProductCategories: () => null }));
jest.mock('../components/product/image', () => ({ ProductImage: () => null }));
jest.mock('../components/product/tags', () => ({ ProductTags: () => null }));
jest.mock('../components/product/tax-based-on', () => ({ TaxBasedOn: () => null }));
jest.mock('../components/product/variable-image', () => ({ VariableProductImage: () => null }));
jest.mock('../components/product/variable-price', () => ({ VariableProductPrice: () => null }));
jest.mock('../components/product/variable-product-row', () => ({ VariableProductRow: () => null }));
jest.mock('../components/product/variation-image', () => ({ ProductVariationImage: () => null }));
jest.mock('../components/text-cell', () => ({ TextCell: () => null }));

function latestState(): QueryStateOf<'products'> {
	const call = mockUseRelationalCollectionBinding.mock.calls.at(-1);
	if (!call) throw new Error('relational products binding was not called');
	return call[0] as QueryStateOf<'products'>;
}

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
			filters: { categories: [], tags: [], brands: [] },
			sort: { field: 'name', direction: 'asc' },
			limit: 10,
		});
		expect(mockDataTableProps).toMatchObject({
			resource: mockBinding.resource,
			sort: { field: 'name', direction: 'asc' },
			active$: mockBinding.active$,
			total$: mockBinding.total$,
			totalSource$: mockBinding.totalSource$,
			sync: mockBinding.sync,
		});
		expect(mockDataTableProps).not.toHaveProperty('query');
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

		mockSortBy = 'type';
		render(<ProductsScreen />);
		expect(latestState().sort).toEqual({ field: 'name', direction: 'asc' });
	});
});
