/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { ObservableResource } from 'observable-hooks';

import { OrdersScreen } from './index';

import type { QueryStateOf } from '../../../../query';

const mockBinding = {
	resource: new ObservableResource(
		new BehaviorSubject({ hits: [], searchActive: false, searchState: 'answered' })
	),
	active$: of(false),
	total$: of(27),
	sync: jest.fn(async () => undefined),
};
const mockUseCollectionBinding = jest.fn((_collection: unknown, _state: unknown) => mockBinding);
let mockPointer = 'fine';
let mockSelected: string | undefined;
let mockPhone = false;
const mockSetParams = jest.fn();
const mockScroll = jest.fn();
let mockDataTableProps: Record<string, unknown> = {};
let mockSortBy = 'date_created_gmt';
let mockSortDirection = 'desc';
let mockStoreID: number | undefined = 9;

jest.mock('../../../../query', () => {
	const actual = jest.requireActual('../../../../query');
	return {
		...actual,
		useCollectionBinding: (collection: unknown, state: unknown) =>
			mockUseCollectionBinding(collection, state),
	};
});

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (r: unknown) => unknown) => select(record),
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
jest.mock('@wcpos/components/suspense', () => ({ Suspense: React.Suspense }));
jest.mock('../../components/data-table/v2', () => ({
	DataTable: (props: Record<string, unknown>) => {
		mockDataTableProps = props;
		React.useImperativeHandle(props.listRef as React.Ref<unknown>, () => ({
			scrollToIndex: mockScroll,
		}));
		const config = props.tableConfig as {
			data: { id: string; type?: string; day?: string; label?: string }[];
		};
		const renderItem = props.renderItem as (args: {
			item: { id: string; original: unknown };
			index: number;
		}) => React.ReactNode;
		return (
			<div data-testid="orders-table">
				{config.data.length === 0
					? (props.noDataMessage as React.ReactNode)
					: config.data.map((item, index) => (
							<React.Fragment key={item.id}>
								{renderItem({ item: { id: item.id, original: item }, index })}
							</React.Fragment>
						))}
			</div>
		);
	},
}));
jest.mock('../../components/data-table/v2/skeleton', () => ({
	DataTableSkeleton: ({ id }: { id: string }) => <div data-testid={`skeleton-${id}`} />,
}));
jest.mock('../../components/ui-settings', () => ({
	UISettingsDialog: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../use-barcode', () => ({ useBarcode: jest.fn(() => ({ onKeyPress: jest.fn() })) }));
jest.mock('../../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: { sortBy: mockSortBy, sortDirection: mockSortDirection },
	}),
}));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({
		wpCredentials: { id: 7 },
		store: mockStoreID === undefined ? undefined : { id: mockStoreID },
	}),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('./filter-bar', () => ({
	FilterBar: () => {
		const { useQueryStateActions } = jest.requireActual('../../../../query');
		const actions = useQueryStateActions();
		return <button data-testid="search-probe" onClick={() => actions.setSearch('smith')} />;
	},
}));

jest.mock('../cells/actions', () => ({ Actions: () => null }));
jest.mock('../cells/address', () => ({ Address: () => null }));
jest.mock('../cells/note', () => ({ Note: () => null }));
jest.mock('../cells/receipt', () => ({ Receipt: () => null }));
jest.mock('../../components/record-date-cell', () => ({ RecordDateCell: () => null }));
jest.mock('../../components/order/cashier', () => ({ Cashier: () => null }));
jest.mock('../../components/order/created-via', () => ({ CreatedVia: () => null }));
jest.mock('../../components/order/customer', () => ({ Customer: () => null }));
jest.mock('../../components/order/order-number', () => ({ OrderNumber: () => null }));
jest.mock('../../components/order/payment-method', () => ({ PaymentMethod: () => null }));
jest.mock('../../components/order/status', () => ({
	Status: () => null,
	OrderStatusBadge: () => null,
}));
jest.mock('../../components/order/total', () => ({ Total: () => null, OrderTotal: () => null }));
jest.mock('../../components/record-text-cell', () => ({ RecordTextCell: () => null }));
jest.mock('../../hooks/use-referenced-customer-demand', () => ({
	useReferencedCustomerDemand: jest.fn(),
}));

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

		fireEvent.click(screen.getByTestId('search-probe'));
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

jest.mock('../../components/order/register', () => ({ Register: () => null }));

jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/lib/device', () => ({
	usePointer: () => mockPointer,
	useIsPhone: () => mockPhone,
	DeviceScope: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-router', () => ({
	useLocalSearchParams: () => ({ order: mockSelected }),
	useRouter: () => ({ setParams: mockSetParams }),
}));
jest.mock('../../../../hooks/use-store-day', () => ({
	...jest.requireActual('../../../../hooks/use-store-day'),
	useStoreDay: () => ({ timezone: 'America/New_York' }),
}));
jest.mock('./cells/status', () => ({ Status: () => null, OrderStatusBadge: () => null }));
jest.mock('./cells/date', () => ({ DateCell: () => null }));
jest.mock('./cells/total', () => ({ Total: () => null, OrderTotal: () => null }));
jest.mock('../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Jane' }),
}));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Item: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('../../components/data-table/v2/rows', () => ({ DataTableRow: () => null }));
beforeEach(() => {
	mockPointer = 'fine';
	mockSetParams.mockClear();
	mockScroll.mockClear();
	mockStoreID = 9;
	mockSortBy = 'date_created_gmt';
	mockSortDirection = 'desc';
});
it('distinguishes empty baseline from no results and clears filters and search', () => {
	render(<OrdersScreen />);
	expect(screen.getByTestId('no-data-message').textContent).toContain('orders.no_orders_yet');
	fireEvent.click(screen.getByTestId('search-probe'));
	expect(screen.getByTestId('no-data-message').textContent).toContain(
		'orders.nothing_matches_filters'
	);
	fireEvent.click(screen.getByText('orders.clear_filters'));
	expect(latestState().search).toBe('');
	expect(latestState().filters).toEqual({ cashier: '7', store: '9' });
});
it('interleaves store-day headings only on date-created sort', () => {
	const subject = new BehaviorSubject({
		hits: [
			{ id: 'one', record: { uuid: 'one', payload: { date_created_gmt: '2026-09-17T01:00:00' } } },
			{ id: 'two', record: { uuid: 'two', payload: { date_created_gmt: '2026-09-16T23:00:00' } } },
			{
				id: 'three',
				record: { uuid: 'three', payload: { date_created_gmt: '2026-09-16T01:00:00' } },
			},
		],
		searchActive: false,
		searchState: 'answered',
	});
	const original = mockBinding.resource;
	mockBinding.resource = new ObservableResource(subject) as typeof original;
	try {
		const { unmount } = render(<OrdersScreen />);
		expect(screen.getAllByTestId(/^orders-day-heading-/).map((n) => n.dataset.testid)).toEqual([
			'orders-day-heading-2026-09-16',
			'orders-day-heading-2026-09-15',
		]);
		const config = mockDataTableProps.tableConfig as { data: { id: string }[] };
		expect(config.data.map((i) => i.id)).toEqual([
			'day-2026-09-16',
			'one',
			'two',
			'day-2026-09-15',
			'three',
		]);
		act(() =>
			(
				mockDataTableProps.actions as { setSort: (field: string, direction: string) => void }
			).setSort('total', 'asc')
		);
		expect(screen.queryAllByTestId(/^orders-day-heading-/)).toHaveLength(0);
		unmount();
	} finally {
		mockBinding.resource = original;
	}
});

jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));

it('uses the orders skeleton while the binding resource is unresolved', () => {
	const original = mockBinding.resource;
	mockBinding.resource = new ObservableResource(new Subject()) as typeof original;
	try {
		const { unmount } = render(<OrdersScreen />);
		expect(screen.getByTestId('skeleton-orders')).toBeTruthy();
		expect(screen.queryByTestId('orders-table')).toBeNull();
		unmount();
	} finally {
		mockBinding.resource = original;
	}
});
it('keeps rows and shows the searching line only for pending results with rows', () => {
	const original = mockBinding.resource;
	const source = new BehaviorSubject({
		hits: [
			{ id: 'one', record: { uuid: 'one', payload: { date_created_gmt: '2026-09-17T01:00:00' } } },
		],
		searchActive: true,
		searchState: 'pending',
	});
	mockBinding.resource = new ObservableResource(source) as typeof original;
	try {
		const { unmount } = render(<OrdersScreen />);
		expect(screen.getByTestId('orders-searching-line')).toBeTruthy();
		expect(screen.getByTestId('orders-table')).toBeTruthy();
		act(() => source.next({ ...source.value, hits: [] }));
		expect(screen.queryByTestId('orders-searching-line')).toBeNull();
		unmount();
	} finally {
		mockBinding.resource = original;
	}
});

it('navigates from the actual focused coarse row, skipping headings, then opens and escapes', () => {
	mockPointer = 'coarse';
	const original = mockBinding.resource;
	const source = new BehaviorSubject({
		hits: ['one', 'two', 'three'].map((id, index) => ({
			id,
			record: {
				uuid: id,
				payload: { number: String(index + 1), date_created_gmt: '2026-09-17T01:00:00' },
			},
		})),
		searchActive: false,
		searchState: 'answered',
	});
	mockBinding.resource = new ObservableResource(source) as typeof original;
	try {
		const { unmount } = render(<OrdersScreen />);
		const row = screen.getByTestId('orders-row-two');
		fireEvent.focus(row);
		fireEvent.keyDown(row, { key: 'ArrowDown' });
		expect(mockScroll).toHaveBeenLastCalledWith({ index: 3, align: 'center', animated: false });
		fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
		expect(mockSetParams).toHaveBeenLastCalledWith({ order: 'three' });
		fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
		expect(mockSetParams).toHaveBeenLastCalledWith({ order: undefined });
		unmount();
	} finally {
		mockBinding.resource = original;
	}
});

jest.mock('../../components/management-bar', () => ({
	ManagementBar: ({ search, children }: React.PropsWithChildren<{ search: React.ReactNode }>) => (
		<div>
			{search}
			{children}
		</div>
	),
}));
jest.mock('./display-options', () => ({ DisplayOptions: () => null }));
jest.mock('./order-pane', () => ({
	OrderPane: ({ selected, onClose }: { selected: string; onClose: () => void }) => (
		<button data-testid="order-pane" onClick={onClose}>
			{selected}
		</button>
	),
}));
jest.mock('../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: 'md' }) }));
jest.mock('../../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ license: { isPro: true } }),
}));
jest.mock('../../components/header/upgrade-notice', () => ({ UpgradeNotice: () => null }));
jest.mock('@wcpos/components/v2/dialog', () => ({
	Dialog: ({ children }: React.PropsWithChildren) => children,
	DialogContent: ({ children }: React.PropsWithChildren) => (
		<div data-testid="phone-page">{children}</div>
	),
	DialogTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
jest.mock('react-native-reanimated', () => ({
	__esModule: true,
	default: { View: ({ children }: React.PropsWithChildren) => <div>{children}</div> },
	FadeInRight: { duration: () => ({ easing: () => ({ reduceMotion: () => undefined }) }) },
	ReduceMotion: { System: 'system' },
}));
jest.mock('@wcpos/components/lib/motion', () => ({
	BEATS: { ordersPane: { duration: 220, easing: 'ease' } },
}));
afterEach(() => {
	mockSelected = undefined;
	mockPhone = false;
});
it('searches from the management bar and opens the selected pane beside the list', () => {
	mockSelected = 'one';
	render(<OrdersScreen />);
	expect(screen.getByTestId('order-pane').textContent).toBe('one');
	expect(screen.queryByTestId('phone-page')).toBeNull();
	fireEvent.click(screen.getByTestId('order-pane'));
	expect(mockSetParams).toHaveBeenLastCalledWith({ order: undefined });
	expect(screen.getByTestId('search-orders')).toBeTruthy();
});
it('renders the selected order as a full page on the phone', () => {
	mockPhone = true;
	mockSelected = 'one';
	render(<OrdersScreen />);
	expect(screen.getByTestId('phone-page').contains(screen.getByTestId('order-pane'))).toBe(true);
});

it('ignores reselecting the same row and returns focus there when the pane closes', () => {
	mockPointer = 'coarse';
	mockSelected = 'one';
	const original = mockBinding.resource;
	mockBinding.resource = new ObservableResource(
		new BehaviorSubject({
			hits: [{ id: 'one', record: { uuid: 'one', payload: { number: '1' } } }],
			searchActive: false,
			searchState: 'answered',
		})
	) as unknown as typeof original;
	try {
		render(<OrdersScreen />);
		fireEvent.click(screen.getByTestId('orders-row-one'));
		expect(mockSetParams).not.toHaveBeenCalled();
		fireEvent.click(screen.getByTestId('order-pane'));
		expect(mockSetParams).toHaveBeenCalledWith({ order: undefined });
		expect(document.activeElement?.getAttribute('aria-selected')).toBe('true');
	} finally {
		mockBinding.resource = original;
	}
});
