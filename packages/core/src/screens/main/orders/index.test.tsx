/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { OrdersScreen } from './index';

import type { QueryStateOf } from '../../../query';

const mockBinding = {
	resource: { kind: 'orders-resource' },
	active$: of(false),
	total$: of(27),
	totalSource$: of('coverage' as const),
	sync: jest.fn(async () => undefined),
};
const mockUseCollectionBinding = jest.fn((_collection: unknown, _state: unknown) => mockBinding);
let mockDataTableProps: Record<string, unknown> = {};
let mockSortBy = 'date_created_gmt';
let mockSortDirection = 'desc';
let mockStoreID: number | undefined = 9;

jest.mock('../../../query', () => {
	const actual = jest.requireActual('../../../query');
	return {
		...actual,
		useCollectionBinding: (collection: unknown, state: unknown) =>
			mockUseCollectionBinding(collection, state),
	};
});

jest.mock('@wcpos/query', () => ({
	useQuery: () => {
		throw new Error('legacy useQuery reached');
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
		return <div data-testid="orders-table" />;
	},
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
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({
		wpCredentials: { id: 7 },
		store: mockStoreID === undefined ? undefined : { id: mockStoreID },
	}),
}));
jest.mock('../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('./filter-bar', () => ({ FilterBar: () => null }));
jest.mock('./ui-settings-form', () => ({ UISettingsForm: () => null }));
jest.mock('./cells/actions', () => ({ Actions: () => null }));
jest.mock('./cells/address', () => ({ Address: () => null }));
jest.mock('./cells/note', () => ({ Note: () => null }));
jest.mock('./cells/receipt', () => ({ Receipt: () => null }));
jest.mock('../components/date', () => ({ DateCell: () => null }));
jest.mock('../components/order/cashier', () => ({ Cashier: () => null }));
jest.mock('../components/order/created-via', () => ({ CreatedVia: () => null }));
jest.mock('../components/order/customer', () => ({ Customer: () => null }));
jest.mock('../components/order/order-number', () => ({ OrderNumber: () => null }));
jest.mock('../components/order/payment-method', () => ({ PaymentMethod: () => null }));
jest.mock('../components/order/status', () => ({ Status: () => null }));
jest.mock('../components/order/total', () => ({ Total: () => null }));
jest.mock('../components/text-cell', () => ({ TextCell: () => null }));

function latestState(): QueryStateOf<'orders'> {
	const call = mockUseCollectionBinding.mock.calls.at(-1);
	if (!call) throw new Error('orders binding was not called');
	return call[1] as QueryStateOf<'orders'>;
}

describe('OrdersScreen query-state wiring', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		mockDataTableProps = {};
		mockSortBy = 'date_created_gmt';
		mockSortDirection = 'desc';
		mockStoreID = 9;
	});

	afterEach(() => jest.useRealTimers());

	it('binds the legacy cashier and selected-store scope as provider initial filters', () => {
		render(<OrdersScreen />);

		expect(latestState()).toEqual({
			search: '',
			filters: { cashier: '7', store: '9' },
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: 10,
		});
		expect(mockDataTableProps).toMatchObject({
			resource: mockBinding.resource,
			sort: { field: 'date_created_gmt', direction: 'desc' },
			active$: mockBinding.active$,
			total$: mockBinding.total$,
			totalSource$: mockBinding.totalSource$,
			sync: mockBinding.sync,
		});
		expect(mockDataTableProps).not.toHaveProperty('query');
	});

	it('preserves the legacy POS created-via fallback when no store is selected', () => {
		mockStoreID = undefined;

		render(<OrdersScreen />);

		expect(latestState().filters).toEqual({ cashier: '7', store: 'woocommerce-pos' });
	});

	it('re-initializes the provider filters when the selected store scope changes', () => {
		const { rerender } = render(<OrdersScreen />);
		expect(latestState().filters).toEqual({ cashier: '7', store: '9' });

		mockStoreID = 12;
		rerender(<OrdersScreen />);

		expect(latestState().filters).toEqual({ cashier: '7', store: '12' });
	});

	it('seeds valid persisted sort and rejects fields outside the orders sort surface', () => {
		mockSortBy = 'status';
		mockSortDirection = 'asc';
		const { unmount } = render(<OrdersScreen />);
		expect(latestState().sort).toEqual({ field: 'status', direction: 'asc' });
		unmount();

		mockSortBy = 'shipping';
		render(<OrdersScreen />);
		expect(latestState().sort).toEqual({ field: 'date_created_gmt', direction: 'desc' });
	});

	it('commits search and table actions through query state', () => {
		render(<OrdersScreen />);

		fireEvent.change(screen.getByTestId('search-orders'), { target: { value: 'smith' } });
		expect(latestState().search).toBe('');
		act(() => jest.advanceTimersByTime(250));
		expect(latestState().search).toBe('smith');

		const actions = mockDataTableProps.actions as {
			setSort: (field: 'number', direction: 'asc') => void;
			extendLimit: () => void;
		};
		act(() => actions.extendLimit());
		expect(latestState().limit).toBe(20);
		act(() => actions.setSort('number', 'asc'));
		expect(latestState()).toMatchObject({
			sort: { field: 'number', direction: 'asc' },
			limit: 10,
		});
	});
});
