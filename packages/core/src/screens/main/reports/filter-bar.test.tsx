/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { endOfDay, startOfDay } from 'date-fns';
import { fireEvent, render, screen } from '@testing-library/react';
import { ObservableResource } from 'observable-hooks';
import { of } from 'rxjs';

import { FilterBar } from './filter-bar';
import { QueryStateProvider, useQueryState } from '../../../query';

import type { FiltersOf } from '../../../query';

const mockManager = { engine: {} };
const mockForceRefresh = jest.fn(
	async (_manager: unknown, _wooId: number, _role: string) => undefined
);
const mockUseEngineDocumentByWooId = jest.fn(
	(_collection: string, _wooId: number) => new ObservableResource(of(null as unknown as object))
);

jest.mock('@wcpos/query', () => ({
	useQuery: () => {
		throw new Error('legacy useQuery reached');
	},
	useQueryManager: () => mockManager,
}));
jest.mock('../orders/force-refresh-filter-customer', () => ({
	forceRefreshFilterCustomer: (manager: unknown, wooId: number, role: string) =>
		mockForceRefresh(manager, wooId, role),
}));
jest.mock('../hooks/use-engine-document', () => ({
	useEngineDocumentByWooId: (collection: string, wooId: number) =>
		mockUseEngineDocumentByWooId(collection, wooId),
}));
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({ wpCredentials: { populate$: () => of([]) } }),
}));
jest.mock('../hooks/use-guest-customer', () => ({
	useGuestCustomer: () => ({ id: 0 }),
}));
jest.mock('@wcpos/components/card', () => ({
	Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../components/order/filter-bar/status-pill', () => ({
	StatusPill: () => <div data-testid="shared-status-pill" />,
}));
jest.mock('../components/order/filter-bar/store-pill', () => ({
	StorePill: () => <div data-testid="shared-store-pill" />,
}));
jest.mock('../components/order/filter-bar/customer-pill', () => ({
	CustomerPill: ({ onMissing }: { onMissing: () => void }) => (
		<button data-testid="shared-customer-pill" onClick={onMissing} />
	),
}));
jest.mock('../components/order/filter-bar/cashier-pill', () => ({
	CashierPill: ({ onMissing }: { onMissing: () => void }) => (
		<button data-testid="shared-cashier-pill" onClick={onMissing} />
	),
}));
jest.mock('../components/order/filter-bar/date-range-pill', () => ({
	DateRangePill: ({ onRemove }: { onRemove: () => void }) => (
		<button data-testid="shared-date-range-pill" onClick={onRemove} />
	),
}));
jest.mock('./context', () => ({ useReports: () => ({}) }));
jest.mock('../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: (date: Date) => date.toISOString(),
}));

function FilterProbe() {
	const filters = useQueryState<'orders', FiltersOf<'orders'>>((state) => state.filters);
	return <div data-testid="filters">{JSON.stringify(filters)}</div>;
}

describe('reports FilterBar bindings', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date(2026, 6, 15, 12));
		jest.clearAllMocks();
	});

	afterEach(() => jest.useRealTimers());

	it('resolves selected labels through the engine and renders shared pills', () => {
		render(
			<QueryStateProvider
				collection="orders"
				initialPageSize={Number.MAX_SAFE_INTEGER}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
				initialFilters={{ customer_id: 42, cashier: '7' }}
			>
				<FilterBar />
			</QueryStateProvider>
		);

		expect(mockUseEngineDocumentByWooId).toHaveBeenNthCalledWith(1, 'customers', 42);
		expect(mockUseEngineDocumentByWooId).toHaveBeenNthCalledWith(2, 'customers', 7);
		expect(screen.getByTestId('shared-status-pill')).toBeTruthy();
		expect(screen.getByTestId('shared-store-pill')).toBeTruthy();
		expect(screen.getByTestId('shared-date-range-pill')).toBeTruthy();

		fireEvent.click(screen.getByTestId('shared-customer-pill'));
		fireEvent.click(screen.getByTestId('shared-cashier-pill'));
		expect(mockForceRefresh).toHaveBeenNthCalledWith(1, mockManager, 42, 'customer');
		expect(mockForceRefresh).toHaveBeenNthCalledWith(2, mockManager, 7, 'cashier');
	});

	it('keeps the reports safety invariant by resetting a removed date range to today', () => {
		render(
			<QueryStateProvider
				collection="orders"
				initialPageSize={Number.MAX_SAFE_INTEGER}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
				initialFilters={{
					dateRange: {
						from: '2026-07-01T00:00:00.000Z',
						to: '2026-07-02T23:59:59.999Z',
					},
				}}
			>
				<FilterBar />
				<FilterProbe />
			</QueryStateProvider>
		);

		fireEvent.click(screen.getByTestId('shared-date-range-pill'));

		const today = new Date(2026, 6, 15, 12);
		expect(JSON.parse(screen.getByTestId('filters').textContent ?? '{}')).toEqual({
			dateRange: {
				from: startOfDay(today).toISOString(),
				to: endOfDay(today).toISOString(),
			},
		});
	});
});
