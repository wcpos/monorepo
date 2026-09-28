/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { endOfDay, startOfDay } from 'date-fns';
import { utc } from '@date-fns/utc';
import { fireEvent, render, screen } from '@testing-library/react';
import { of } from 'rxjs';

import { ReportsScreen } from './index';

import type { QueryStateOf } from '../../../query';
jest.mock('../hooks/use-rest-http-client', () => ({ useRestHttpClient: jest.fn() }));
jest.mock('@wcpos/hooks/use-online-status', () => ({ useOnlineStatus: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 44 }) }));
jest.mock('../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registerId: 'r', registerName: 'Front' }),
}));
jest.mock('../components/pro-guard', () => ({
	withProAccess: (Component: React.ComponentType) => () =>
		mockPro ? (
			<Component />
		) : (
			<div data-testid="pro-preview">
				<Component />
			</div>
		),
}));
const mockClosureScope = jest.fn();
jest.mock('./closures', () => ({
	Closures: (props: { onClose?: () => void; initialClosureId?: string }) => {
		mockClosureScope(props);
		return props.initialClosureId ? (
			<button data-testid="close-closure" onClick={props.onClose} />
		) : null;
	},
}));
let mockPro = true;
let mockCapabilities: string[] | undefined = ['view_woocommerce_pos_reports'];
jest.mock('../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ license: { isPro: mockPro } }),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/text', () => ({ Text: require('react-native').Text }));
const mockBarScope = jest.fn();
let mockNextStoreID = 9;
const mockViewedStores = of([
	{ id: 9, timezone: 'UTC' },
	{ id: 21, timezone: 'America/New_York' },
]);
jest.mock('./bar', () => ({
	CashierButton: () => null,
	ScopeHint: () => null,
	Bar: ({
		onBack,
		onScopeChange,
		scope,
	}: {
		scope: unknown;
		onBack: () => void;
		onScopeChange: (scope: unknown) => void;
	}) => {
		mockBarScope(scope);
		return (
			<>
				<button data-testid="reports-back-sales" onClick={onBack} />
				<button
					data-testid="past-scope"
					onClick={() =>
						onScopeChange({
							from: '2026-07-14',
							to: '2026-07-14',
							storeId: mockNextStoreID,
							registerId: 'other',
						})
					}
				/>
			</>
		);
	},
}));

const mockBinding = {
	resource: { kind: 'reports-orders-resource' },
	active$: of(false),
	total$: of(24),
	sync: jest.fn(async () => undefined),
};
const mockUseCollectionBinding = jest.fn((_collection: unknown, _state: unknown) => mockBinding);
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
	// The store-day hook reads zone fields through it; a plain test record is read directly.
	useDocField: (
		source: Record<string, unknown> | undefined,
		select: (v: Record<string, unknown>) => unknown
	) => (source ? select(source) : undefined),
	useQuery: () => {
		throw new Error('legacy useQuery reached');
	},
}));
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => (
		<React.Suspense fallback={null}>{children}</React.Suspense>
	),
}));
let mockReportsPending = false;
const mockPendingReport = new Promise(() => {});
jest.mock('./context', () => ({
	ReportsProvider: ({ children }: { children: React.ReactNode }) => {
		if (mockReportsPending) throw mockPendingReport;
		return children;
	},
}));
jest.mock('./reports', () => ({
	Reports: () => {
		const actions = jest.requireActual('../../../query').useQueryStateActions();
		return (
			<button
				data-testid="legacy-register"
				onClick={() => actions.setFilter('register', 'other')}
			/>
		);
	},
}));
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({
		wpCredentials: { id: 7, capabilities: mockCapabilities, populate$: () => mockViewedStores },
		site: { timezone_string: 'UTC', gmt_offset: '0' },
		store: mockStoreID === undefined ? undefined : { id: mockStoreID },
	}),
}));
jest.mock('../../../hooks/use-local-date', () => ({
	useLocalDate: () => ({ formatDate: require('date-fns').format }),
	convertLocalDateToUTCString: (date: Date) => date.toISOString(),
	convertUTCStringToLocalDate: (value: string) => new Date(value),
}));
jest.mock('../contexts/ui-settings', () => ({
	useUISettings: () => ({
		uiSettings: { sortBy: mockSortBy, sortDirection: mockSortDirection },
	}),
}));

function latestState(): QueryStateOf<'orders'> {
	const call = mockUseCollectionBinding.mock.calls.at(-1);
	if (!call) throw new Error('reports orders binding was not called');
	return call[1] as QueryStateOf<'orders'>;
}

describe('ReportsScreen query-state wiring', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date(2026, 6, 15, 12));
		jest.clearAllMocks();
		mockSortBy = 'date_created_gmt';
		mockSortDirection = 'desc';
		mockStoreID = 9;
		mockPro = true;
		mockCapabilities = ['view_woocommerce_pos_reports'];
	});

	afterEach(() => jest.useRealTimers());

	it('binds the completed current-day report window and current cashier/store scope', () => {
		render(<ReportsScreen />);

		const today = new Date(2026, 6, 15, 12);
		expect(mockUseCollectionBinding).toHaveBeenCalledWith('orders', expect.any(Object));
		expect(latestState()).toEqual({
			search: '',
			filters: {
				status: 'completed',
				dateRange: {
					from: startOfDay(today, { in: utc }).toISOString(),
					to: endOfDay(today, { in: utc }).toISOString(),
				},
				cashier: '7',
				store: '9',
			},
			sort: { field: 'date_created_gmt', direction: 'desc' },
			limit: Number.MAX_SAFE_INTEGER,
		});
	});

	it('preserves the POS created-via fallback and valid persisted report sort', () => {
		mockStoreID = undefined;
		mockSortBy = 'status';
		mockSortDirection = 'asc';

		render(<ReportsScreen />);

		expect(latestState()).toMatchObject({
			filters: { cashier: '7', store: 'woocommerce-pos' },
			sort: { field: 'status', direction: 'asc' },
		});
	});

	it('rejects sort fields outside the orders surface', () => {
		mockSortBy = 'shipping';

		render(<ReportsScreen />);

		expect(latestState().sort).toEqual({ field: 'date_created_gmt', direction: 'desc' });
	});

	// Revert: stringify store zero as metadata scope "0" rather than the POS source.
	it('restores the POS source after switching Sales to store 5 and back to store 0', () => {
		mockStoreID = 0;
		render(<ReportsScreen />);
		expect(latestState().filters.store).toBe('woocommerce-pos');
		mockNextStoreID = 5;
		fireEvent.click(screen.getByTestId('past-scope'));
		expect(latestState().filters.store).toBe('5');
		mockNextStoreID = 0;
		fireEvent.click(screen.getByTestId('past-scope'));
		expect(latestState().filters.store).toBe('woocommerce-pos');
	});

	it('re-initializes report filters when the selected store scope changes', () => {
		const { rerender } = render(<ReportsScreen />);
		expect(latestState().filters.store).toBe('9');

		mockStoreID = 12;
		rerender(<ReportsScreen />);

		expect(latestState().filters.store).toBe('12');
	});

	it('re-initializes report filters when the plan drops to Free', () => {
		const { rerender } = render(<ReportsScreen />);
		const proRange = latestState().filters.dateRange;
		expect(proRange).toBeDefined();

		mockPro = false;
		rerender(<ReportsScreen />);

		// A fresh query on the bound register, not the Pro scope kept alive under locked controls.
		expect(latestState().filters.register).toBeDefined();
		expect(latestState().filters.dateRange).toEqual(proRange);
	});
});

// Revert: convert a newly selected store's days using the bound till's UTC midnight.
it('uses the viewed store midnight for Sales immediately on a cross-store selection', () => {
	mockStoreID = 9;
	mockCapabilities = ['view_woocommerce_pos_reports'];
	mockNextStoreID = 21;
	render(<ReportsScreen />);
	fireEvent.click(screen.getByTestId('past-scope'));
	expect(latestState().filters).toMatchObject({
		store: '21',
		dateRange: {
			from: '2026-07-14T04:00:00.000Z',
			to: '2026-07-15T03:59:59.999Z',
		},
	});
	expect(mockBarScope).toHaveBeenLastCalledWith(
		expect.objectContaining({ storeId: 21, from: '2026-07-14', to: '2026-07-14' })
	);
	mockNextStoreID = 9;
});

// Revert: leave the orders provider mounted around both rooms.
it('unmounts the Sales binding in Closures and remounts it only on returning to Sales', () => {
	render(<ReportsScreen />);
	mockUseCollectionBinding.mockClear();
	fireEvent.click(screen.getByTestId('reports-closures-link'));
	expect(mockUseCollectionBinding).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('reports-back-sales'));
	// The viewed-store directory can emit after mount; both renders use the Sales binding.
	expect(mockUseCollectionBinding).toHaveBeenCalledWith('orders', expect.any(Object));
});

// Revert: remove the capability boundary before local report readers mount.
it('does not mount report readers for a cashier without report permission', () => {
	mockCapabilities = [];
	mockUseCollectionBinding.mockClear();
	mockClosureScope.mockClear();
	render(<ReportsScreen />);
	expect(mockUseCollectionBinding).not.toHaveBeenCalled();
	expect(mockClosureScope).not.toHaveBeenCalled();
	expect(screen.queryByTestId('reports-closures-link')).toBeNull();
	mockCapabilities = ['view_woocommerce_pos_reports'];
});
// Revert: trust a retained Pro scope after the license becomes Free.
it('constrains a retained Pro scope before mounting Free closures', () => {
	jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00Z'));
	mockPro = true;
	mockStoreID = 9;
	mockCapabilities = ['view_woocommerce_pos_reports'];
	const view = render(<ReportsScreen />);
	fireEvent.click(screen.getByTestId('reports-closures-link'));
	fireEvent.click(screen.getByTestId('past-scope'));
	expect(mockClosureScope).toHaveBeenLastCalledWith({
		scope: expect.objectContaining({ registerId: 'other' }),
		onClose: expect.any(Function),
	});
	mockPro = false;
	view.rerender(<ReportsScreen />);
	expect(mockClosureScope).toHaveBeenLastCalledWith({
		scope: expect.objectContaining({
			from: '2026-07-15',
			to: '2026-07-15',
			registerId: 'r',
			storeId: 9,
		}),
		onClose: expect.any(Function),
	});
	mockPro = true;
	jest.useRealTimers();
});

// Revert: feed the shared Sales bar a separate scope instead of the live orders query.
it('shows Sales actual scope initially and after a legacy filter changes', () => {
	mockCapabilities = ['view_woocommerce_pos_reports'];
	mockPro = true;
	render(<ReportsScreen />);
	expect(mockBarScope).toHaveBeenLastCalledWith(expect.objectContaining({ registerId: '' }));
	fireEvent.click(screen.getByTestId('legacy-register'));
	expect(mockBarScope).toHaveBeenLastCalledWith(expect.objectContaining({ registerId: 'other' }));
});

// Revert: let a pending Sales resource suspend the page bar and trap the room switch.
it('can enter local Closures while the Sales workspace is still loading', () => {
	mockReportsPending = true;
	mockCapabilities = ['view_woocommerce_pos_reports'];
	try {
		render(<ReportsScreen />);
		fireEvent.click(screen.getByTestId('reports-closures-link'));
		expect(mockClosureScope).toHaveBeenCalled();
	} finally {
		mockReportsPending = false;
	}
});

let mockRoute: Record<string, string | undefined> = {};
const mockSetParams = jest.fn((params) => {
	mockRoute = { ...mockRoute, ...params };
});
const mockOpenDrawer = jest.fn();
jest.mock('expo-router', () => ({
	useLocalSearchParams: () => mockRoute,
	useRouter: () => ({ setParams: mockSetParams }),
	useNavigation: () => ({ openDrawer: mockOpenDrawer, setParams: mockSetParams }),
}));
jest.mock('../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: 'sm' }) }));
jest.mock('@wcpos/components/button', () => ({
	ButtonText: require('react-native').Text,
	Button: ({
		testID,
		onPress,
		children,
	}: {
		testID: string;
		onPress: () => void;
		children: React.ReactNode;
	}) => (
		<button data-testid={testID} onClick={onPress}>
			{children}
		</button>
	),
}));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
jest.mock('@wcpos/components/calendar', () => ({ Calendar: () => null }));
jest.mock('@wcpos/components/popover', () => ({
	Popover: ({ children }: React.PropsWithChildren) => children,
	PopoverTrigger: ({ children }: React.PropsWithChildren) => children,
	PopoverContent: () => null,
}));
jest.mock('../components/header/upgrade-notice', () => ({ UpgradeNotice: () => null }));
// Revert: ignore the register-panel route selector and mount Sales instead of the requested closure.
it('opens the requested closure room and business day for Pro', () => {
	mockPro = true;
	mockCapabilities = ['view_woocommerce_pos_reports'];
	mockRoute = { closureId: 'c', businessDay: '2026-09-16', registerId: 'r' };
	render(<ReportsScreen />);
	expect(mockClosureScope).toHaveBeenLastCalledWith(
		expect.objectContaining({
			initialClosureId: 'c',
			scope: expect.objectContaining({ from: '2026-09-16', to: '2026-09-16' }),
		})
	);
	mockRoute = {};
});

// Revert: derive an unstamped closure route from closedAt instead of openedAt.
it('opens an unstamped last closure on the day used by the local list', () => {
	mockPro = true;
	mockCapabilities = ['view_woocommerce_pos_reports'];
	mockRoute = {
		closureId: 'legacy',
		openedAt: '2026-09-16T23:00:00Z',
		closedAt: '2026-09-17T01:00:00Z',
		registerId: 'r',
	};
	render(<ReportsScreen />);
	expect(mockClosureScope).toHaveBeenLastCalledWith(
		expect.objectContaining({
			initialClosureId: 'legacy',
			scope: expect.objectContaining({ from: '2026-09-16', to: '2026-09-16' }),
		})
	);
	mockRoute = {};
});

// Revert: return bare denial text without the phone drawer control.
it('lets a denied cashier return to the drawer without mounting report readers', () => {
	mockCapabilities = [];
	mockUseCollectionBinding.mockClear();
	mockClosureScope.mockClear();
	render(<ReportsScreen />);
	fireEvent.click(screen.getByTestId('drawer-open-button'));
	expect(mockOpenDrawer).toHaveBeenCalledTimes(1);
	expect(mockUseCollectionBinding).not.toHaveBeenCalled();
	expect(mockClosureScope).not.toHaveBeenCalled();
});

// Revert: render denied navigation without PageBar's top safe-area padding.
it('places denied navigation below the phone safe area', () => {
	mockCapabilities = [];
	render(<ReportsScreen />);
	expect(screen.getByTestId('reports-denied').parentElement?.style.paddingTop).toBe('52px');
	expect(
		screen
			.getByTestId('reports-denied')
			.parentElement?.contains(screen.getByTestId('drawer-open-button'))
	).toBe(true);
	mockCapabilities = ['view_woocommerce_pos_reports'];
});

// Revert: treat an absent legacy capability payload as an explicit denial.
it('keeps Sales and Closures accessible when capabilities are unknown', () => {
	mockCapabilities = undefined;
	render(<ReportsScreen />);
	expect(screen.queryByTestId('reports-denied')).toBeNull();
	fireEvent.click(screen.getByTestId('reports-closures-link'));
	expect(mockClosureScope).toHaveBeenCalled();
	mockCapabilities = ['view_woocommerce_pos_reports'];
});

// Revert: retain the consumed closureId, or remount the shell when it is cleared.
it('clears a closed deep link without leaving Closures or reopening it after Sales', () => {
	mockCapabilities = ['view_woocommerce_pos_reports'];
	mockRoute = { closureId: 'c', businessDay: '2026-09-16', registerId: 'r' };
	const view = render(<ReportsScreen />);
	fireEvent.click(screen.getByTestId('close-closure'));
	expect(mockSetParams).toHaveBeenCalledWith({ closureId: undefined });
	view.rerender(<ReportsScreen />);
	expect(screen.queryByTestId('legacy-register')).toBeNull();
	fireEvent.click(screen.getByTestId('reports-back-sales'));
	fireEvent.click(screen.getByTestId('reports-closures-link'));
	expect(screen.queryByTestId('close-closure')).toBeNull();
	// A later visit to the same deep link must still select it.
	mockRoute = { ...mockRoute, closureId: 'c' };
	view.rerender(<ReportsScreen />);
	expect(screen.getByTestId('close-closure')).toBeTruthy();
	mockRoute = {};
});

// Revert: restore the Pro overlay or leave Free Sales unscoped to its bound till.
it('renders the Sales body for a Free cashier without the Pro overlay', () => {
	mockPro = false;
	mockStoreID = 9;
	mockCapabilities = ['view_woocommerce_pos_reports'];
	try {
		render(<ReportsScreen />);
		expect(screen.getByTestId('legacy-register')).toBeTruthy();
		expect(screen.queryByTestId('pro-preview')).toBeNull();
		expect(screen.getByTestId('reports-period').querySelector('[data-icon="lock"]')).toBeTruthy();
		expect(latestState().filters).toMatchObject({ register: 'r', store: '9' });
	} finally {
		mockPro = true;
	}
});
