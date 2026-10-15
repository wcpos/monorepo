/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';

import { OrdersScreen } from './index';

import type { QueryStateOf } from '../../../query';

// The orders query handle as a reader sees it (one snapshot, driven with `set`).
type FakeHandle = import('@wcpos/query').QueryHandle & {
	set(partial: Record<string, unknown>): void;
};
const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle') as {
	fakeQueryHandle: (initial?: Record<string, unknown>) => FakeHandle;
};
const answered = (hits: unknown[] = [], extra: Record<string, unknown> = {}) =>
	fakeQueryHandle({
		result: { hits, searchActive: false, searchState: 'answered', ...extra },
		total: 27,
	});
let mockHandle: FakeHandle = answered();
const mockUseCollectionQueryHandle = jest.fn((_collection: unknown, _state: unknown) => mockHandle);
let mockPointer = 'fine';
let mockSelected: string | undefined;
let mockPhone = false;
const mockSetParams = jest.fn();
const mockScroll = jest.fn();
let mockDataTableProps: Record<string, unknown> = {};
let mockSortBy = 'date_created_gmt';
let mockSortDirection = 'desc';
let mockStoreID: number | undefined = 9;

jest.mock('../../../query', () => {
	const actual = jest.requireActual('../../../query');
	return {
		...actual,
		useCollectionQueryHandle: (collection: unknown, state: unknown) =>
			mockUseCollectionQueryHandle(collection, state),
	};
});

jest.mock('@wcpos/query', () => ({
	useRecordField: (record: unknown, select: (r: unknown) => unknown) => select(record),
	useQuery: () => {
		throw new Error('legacy useQuery reached');
	},
	queryHandleAnswers$: (handle: { observe(): unknown }) => handle.observe(),
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
jest.mock('../components/data-table', () => ({
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
jest.mock('../components/data-table/skeleton', () => ({
	DataTableSkeleton: ({ id }: { id: string }) => <div data-testid={`skeleton-${id}`} />,
}));
jest.mock('../components/ui-settings', () => ({
	UISettingsDialog: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('./use-barcode', () => ({ useBarcode: jest.fn(() => ({ onKeyPress: jest.fn() })) }));
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
jest.mock('./filter-bar', () => ({
	FilterBar: () => {
		const { useQueryStateActions } = jest.requireActual('../../../query');
		const actions = useQueryStateActions();
		return <button data-testid="search-probe" onClick={() => actions.setSearch('smith')} />;
	},
}));

jest.mock('./cells/actions', () => ({ Actions: () => null }));
jest.mock('./cells/address', () => ({ Address: () => null }));
jest.mock('./cells/note', () => ({ Note: () => null }));
jest.mock('./cells/receipt', () => ({ Receipt: () => null }));
jest.mock('../components/record-date-cell', () => ({ RecordDateCell: () => null }));
jest.mock('../components/order/cashier', () => ({ Cashier: () => null }));
jest.mock('../components/order/created-via', () => ({ CreatedVia: () => null }));
jest.mock('../components/order/customer', () => ({ Customer: () => null }));
jest.mock('../components/order/order-number', () => ({ OrderNumber: () => null }));
jest.mock('../components/order/payment-method', () => ({ PaymentMethod: () => null }));
jest.mock('../components/record-text-cell', () => ({ RecordTextCell: () => null }));
jest.mock('../hooks/use-referenced-customer-demand', () => ({
	useReferencedCustomerDemand: jest.fn(),
}));

function latestState(): QueryStateOf<'orders'> {
	const call = mockUseCollectionQueryHandle.mock.calls.at(-1);
	if (!call) throw new Error('orders handle was not called');
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
			handle: mockHandle,
			sort: { field: 'date_created_gmt', direction: 'desc' },
		});
		expect(mockDataTableProps).not.toHaveProperty('resource');
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

jest.mock('../components/order/register', () => ({ Register: () => null }));

jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/components/lib/device', () => ({
	usePointer: () => mockPointer,
	useIsPhone: () => mockPhone,
	DeviceScope: ({ children, pointer }: { children: React.ReactNode; pointer?: string }) => (
		<div data-testid="list-scope" data-pointer={pointer ?? 'device'}>
			{children}
		</div>
	),
}));
jest.mock('expo-router', () => ({
	useLocalSearchParams: () => ({ order: mockSelected }),
	useRouter: () => ({ setParams: mockSetParams }),
}));
jest.mock('../../../hooks/use-store-day', () => ({
	...jest.requireActual('../../../hooks/use-store-day'),
	useStoreDay: () => ({ timezone: 'America/New_York' }),
}));
jest.mock('./cells/status', () => ({ Status: () => null, OrderStatusBadge: () => null }));
jest.mock('./cells/date', () => ({ DateCell: () => null }));
jest.mock('./cells/total', () => ({ Total: () => null, OrderTotal: () => null }));
jest.mock('../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({ format: () => 'Jane' }),
}));
jest.mock('@wcpos/components/virtualized-list', () => ({
	Item: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('../components/data-table/rows', () => ({ DataTableRow: () => null }));
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
	const subject = {
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
	};
	const original = mockHandle;
	mockHandle = fakeQueryHandle({ result: subject, total: 27 });
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
		mockHandle = original;
	}
});

jest.mock('@wcpos/utils/open-external-url', () => ({ openExternalURL: jest.fn() }));

it('uses the orders skeleton while the orders handle is unanswered', () => {
	const original = mockHandle;
	mockHandle = fakeQueryHandle({ ready: false });
	try {
		const { unmount } = render(<OrdersScreen />);
		expect(screen.getByTestId('skeleton-orders')).toBeTruthy();
		expect(screen.queryByTestId('orders-table')).toBeNull();
		unmount();
	} finally {
		mockHandle = original;
	}
});
it('keeps the current rows, not the skeleton, while a changed query’s handle answers, then shows its rows', async () => {
	mockPointer = 'coarse';
	const original = mockHandle;
	const row = (id: string) => ({
		id,
		record: { uuid: id, payload: { number: id, date_created_gmt: '2026-09-17T01:00:00' } },
	});
	mockHandle = fakeQueryHandle({
		result: { hits: [row('one')], searchActive: false, searchState: 'answered' },
		total: 27,
	});
	try {
		render(<OrdersScreen />);
		expect(screen.getByTestId('orders-row-one')).toBeTruthy();
		// The query changes (a header sort): the screen asks for a new handle, unanswered.
		const next = fakeQueryHandle({ ready: false });
		mockHandle = next;
		act(() =>
			(
				mockDataTableProps.actions as { setSort: (field: string, direction: string) => void }
			).setSort('total', 'asc')
		);
		expect(mockUseCollectionQueryHandle).toHaveBeenLastCalledWith(
			'orders',
			expect.objectContaining({ sort: { field: 'total', direction: 'asc' } })
		);
		// The old rows stay; no skeleton.
		expect(screen.getByTestId('orders-row-one')).toBeTruthy();
		expect(screen.queryByTestId('skeleton-orders')).toBeNull();
		await act(async () =>
			next.set({
				ready: true,
				result: { hits: [row('two')], searchActive: false, searchState: 'answered' },
			})
		);
		expect(screen.getByTestId('orders-row-two')).toBeTruthy();
		expect(screen.queryByTestId('orders-row-one')).toBeNull();
	} finally {
		mockHandle = original;
	}
});

it('keeps rows and shows the searching line only for pending results with rows', () => {
	const original = mockHandle;
	const source = {
		hits: [
			{ id: 'one', record: { uuid: 'one', payload: { date_created_gmt: '2026-09-17T01:00:00' } } },
		],
		searchActive: true,
		searchState: 'pending',
	};
	mockHandle = fakeQueryHandle({ result: source, total: 27 });
	try {
		const { unmount } = render(<OrdersScreen />);
		expect(screen.getByTestId('orders-searching-line')).toBeTruthy();
		expect(screen.getByTestId('orders-table')).toBeTruthy();
		act(() => mockHandle.set({ result: { ...source, hits: [] } }));
		expect(screen.queryByTestId('orders-searching-line')).toBeNull();
		unmount();
	} finally {
		mockHandle = original;
	}
});

it('navigates from the actual focused coarse row, skipping headings, then opens and escapes', () => {
	mockPointer = 'coarse';
	const original = mockHandle;
	const source = {
		hits: ['one', 'two', 'three'].map((id, index) => ({
			id,
			record: {
				uuid: id,
				payload: { number: String(index + 1), date_created_gmt: '2026-09-17T01:00:00' },
			},
		})),
		searchActive: false,
		searchState: 'answered',
	};
	mockHandle = fakeQueryHandle({ result: source, total: 27 });
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
		mockHandle = original;
	}
});

jest.mock('../components/management-bar', () => ({
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
jest.mock('../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: 'md' }) }));
jest.mock('../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ license: { isPro: true } }),
}));
jest.mock('../components/header/upgrade-notice', () => ({ UpgradeNotice: () => null }));
jest.mock('../components/pro-guard', () => ({
	withProAccess: (Component: React.ComponentType<object>, page: string) =>
		function Guarded(props: object) {
			return (
				<div data-testid={`guard-${page}`}>
					<Component {...props} />
				</div>
			);
		},
}));
jest.mock('@wcpos/components/v2/dialog', () => ({
	Dialog: ({ children }: React.PropsWithChildren) => children,
	DialogContent: ({ children }: React.PropsWithChildren) => (
		<div data-testid="phone-page">{children}</div>
	),
	DialogTitle: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
// The pane's slide is `SlideOver`'s own (tested there); here it is its frame and its content.
jest.mock('@wcpos/components/slide-over', () => ({
	SlideOver: ({
		open,
		from,
		onLeft,
		children,
	}: React.PropsWithChildren<{ open: boolean; from: string; onLeft?: () => void }>) => (
		<div data-testid="orders-pane-frame" data-open={String(open)} data-from={from}>
			<button data-testid="orders-pane-left" onClick={onLeft} />
			{children}
		</div>
	),
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

it('slides the pane out of the right edge, and a closing pane keeps its order until it has left', () => {
	mockSelected = 'one';
	const { rerender } = render(<OrdersScreen />);
	const frame = () => screen.getByTestId('orders-pane-frame');
	expect(frame().dataset).toMatchObject({ open: 'true', from: 'right' });
	mockSelected = undefined;
	rerender(<OrdersScreen />);
	// Closed, but the order it showed is still inside for the slide out.
	expect(frame().dataset.open).toBe('false');
	expect(frame().contains(screen.getByTestId('order-pane'))).toBe(true);
	// The list keeps its narrow rows while the frame is still beside it, and gets its columns
	// back only once the pane has left.
	expect(screen.getByTestId('list-scope').dataset.pointer).toBe('coarse');
	fireEvent.click(screen.getByTestId('orders-pane-left'));
	expect(screen.getByTestId('list-scope').dataset.pointer).toBe('device');
});

it('ignores reselecting the same row and returns focus there when the pane closes', () => {
	mockPointer = 'coarse';
	mockSelected = 'one';
	const original = mockHandle;
	mockHandle = fakeQueryHandle({
		result: {
			hits: [{ id: 'one', record: { uuid: 'one', payload: { number: '1' } } }],
			searchActive: false,
			searchState: 'answered',
		},
		total: 27,
	});
	try {
		render(<OrdersScreen />);
		fireEvent.click(screen.getByTestId('orders-row-one'));
		expect(mockSetParams).not.toHaveBeenCalled();
		fireEvent.click(screen.getByTestId('order-pane'));
		expect(mockSetParams).toHaveBeenCalledWith({ order: undefined });
		expect(document.activeElement?.getAttribute('aria-selected')).toBe('true');
	} finally {
		mockHandle = original;
	}
});

// A Free user below lg has no permanent rail: the bar's menu must stay outside the preview
// overlay, which covers whatever the guard wraps.
it('keeps the management bar outside the Pro guard and the list inside it', () => {
	render(<OrdersScreen />);
	const guard = screen.getByTestId('guard-orders');
	expect(guard.contains(screen.getByTestId('orders-body'))).toBe(true);
	expect(guard.contains(screen.getByTestId('search-orders'))).toBe(false);
});
