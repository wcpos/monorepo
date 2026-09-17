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
jest.mock('../../../services/register/use-register-binding', () => ({
	useRegisterBinding: () => ({ registerId: 'r', registerName: 'Front' }),
}));
jest.mock('../components/pro-guard', () => ({
	withProAccess: (Component: React.ComponentType) => Component,
}));
const mockClosureScope = jest.fn();
jest.mock('./closures', () => ({
	Closures: (props: unknown) => {
		mockClosureScope(props);
		return null;
	},
}));
let mockPro = true;
let mockCapabilities = ['view_woocommerce_pos_reports'];
jest.mock('../../../hooks/use-app-info', () => ({
	useAppInfo: () => ({ license: { isPro: mockPro } }),
}));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('@wcpos/components/text', () => ({ Text: require('react-native').Text }));
const mockBarScope = jest.fn();
jest.mock('./page-bar', () => ({
	PageBar: ({
		onRoomChange,
		onScopeChange,
		scope,
	}: {
		scope: unknown;
		onRoomChange: (v: string) => void;
		onScopeChange: (scope: unknown) => void;
	}) => {
		mockBarScope(scope);
		return (
			<>
				<button data-testid="room-closures" onClick={() => onRoomChange('closures')} />
				<button data-testid="room-sales" onClick={() => onRoomChange('sales')} />
				<button
					data-testid="past-scope"
					onClick={() =>
						onScopeChange({ from: '2026-07-14', to: '2026-07-14', storeId: 9, registerId: 'other' })
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
		wpCredentials: { id: 7, capabilities: mockCapabilities },
		site: { timezone_string: 'UTC', gmt_offset: '0' },
		store: mockStoreID === undefined ? undefined : { id: mockStoreID },
	}),
}));
jest.mock('../../../hooks/use-local-date', () => ({
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

	it('re-initializes report filters when the selected store scope changes', () => {
		const { rerender } = render(<ReportsScreen />);
		expect(latestState().filters.store).toBe('9');

		mockStoreID = 12;
		rerender(<ReportsScreen />);

		expect(latestState().filters.store).toBe('12');
	});
});

// Revert: leave the orders provider mounted around both rooms.
it('unmounts the Sales binding in Closures and remounts it only on returning to Sales', () => {
	render(<ReportsScreen />);
	mockUseCollectionBinding.mockClear();
	fireEvent.click(screen.getByTestId('room-closures'));
	expect(mockUseCollectionBinding).not.toHaveBeenCalled();
	fireEvent.click(screen.getByTestId('room-sales'));
	expect(mockUseCollectionBinding).toHaveBeenCalledTimes(1);
});

// Revert: remove the capability boundary before local report readers mount.
it('does not mount report readers for a cashier without report permission', () => {
	mockCapabilities = [];
	mockUseCollectionBinding.mockClear();
	mockClosureScope.mockClear();
	render(<ReportsScreen />);
	expect(mockUseCollectionBinding).not.toHaveBeenCalled();
	expect(mockClosureScope).not.toHaveBeenCalled();
	expect(screen.queryByTestId('room-closures')).toBeNull();
	mockCapabilities = ['view_woocommerce_pos_reports'];
});
// Revert: trust a retained Pro scope after the license becomes Free.
it('constrains a retained Pro scope before mounting Free closures', () => {
	jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00Z'));
	mockPro = true;
	mockStoreID = 9;
	mockCapabilities = ['view_woocommerce_pos_reports'];
	const view = render(<ReportsScreen />);
	fireEvent.click(screen.getByTestId('room-closures'));
	fireEvent.click(screen.getByTestId('past-scope'));
	expect(mockClosureScope).toHaveBeenLastCalledWith({
		scope: expect.objectContaining({ registerId: 'other' }),
	});
	mockPro = false;
	view.rerender(<ReportsScreen />);
	fireEvent.click(screen.getByTestId('room-closures'));
	expect(mockClosureScope).toHaveBeenLastCalledWith({
		scope: expect.objectContaining({
			from: '2026-07-15',
			to: '2026-07-15',
			registerId: 'r',
			storeId: 9,
		}),
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
		fireEvent.click(screen.getByTestId('room-closures'));
		expect(mockClosureScope).toHaveBeenCalled();
	} finally {
		mockReportsPending = false;
	}
});

let mockRoute: Record<string, string> = {};
jest.mock('expo-router', () => ({ useLocalSearchParams: () => mockRoute }));
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

// Revert: link an older unstamped closure to Today instead of its store-day fallback.
it('opens an unstamped last closure on the day used by the local list', () => {
	mockPro = true;
	mockCapabilities = ['view_woocommerce_pos_reports'];
	mockRoute = { closureId: 'legacy', closedAt: '2026-09-16T17:00:00Z', registerId: 'r' };
	render(<ReportsScreen />);
	expect(mockClosureScope).toHaveBeenLastCalledWith(
		expect.objectContaining({
			initialClosureId: 'legacy',
			scope: expect.objectContaining({ from: '2026-09-16', to: '2026-09-16' }),
		})
	);
	mockRoute = {};
});
