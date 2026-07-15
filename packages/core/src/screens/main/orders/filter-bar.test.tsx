/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { ObservableResource } from 'observable-hooks';
import { of } from 'rxjs';

import { QueryStateProvider } from '../../../query';
import { FilterBar } from './filter-bar';

const mockManager = { engine: {} };
const mockForceRefresh = jest.fn(
	async (_manager: unknown, _wooId: number, _role: string) => undefined
);
const mockUseEngineDocumentByWooId = jest.fn(
	(_collection: string, _wooId: number) => new ObservableResource(of(null as unknown as object))
);

jest.mock('@wcpos/query', () => ({ useQueryManager: () => mockManager }));
jest.mock('./force-refresh-filter-customer', () => ({
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
jest.mock('@wcpos/components/hstack', () => ({
	HStack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../components/order/filter-bar/status-pill', () => ({ StatusPill: () => null }));
jest.mock('../components/order/filter-bar/date-range-pill', () => ({ DateRangePill: () => null }));
jest.mock('../components/order/filter-bar/store-pill', () => ({ StorePill: () => null }));
jest.mock('../components/order/filter-bar/customer-pill', () => ({
	CustomerPill: ({ onMissing }: { onMissing: () => void }) => (
		<button data-testid="missing-customer" onClick={onMissing} />
	),
}));
jest.mock('../components/order/filter-bar/cashier-pill', () => ({
	CashierPill: ({ onMissing }: { onMissing: () => void }) => (
		<button data-testid="missing-cashier" onClick={onMissing} />
	),
}));

describe('orders FilterBar selected-label bindings', () => {
	beforeEach(() => jest.clearAllMocks());

	it('resolves selected customer/cashier by Woo id and preserves forced refresh escalation', () => {
		render(
			<QueryStateProvider
				collection="orders"
				initialPageSize={10}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
				initialFilters={{ customer_id: 42, cashier: '7' }}
			>
				<FilterBar />
			</QueryStateProvider>
		);

		expect(mockUseEngineDocumentByWooId).toHaveBeenNthCalledWith(1, 'customers', 42);
		expect(mockUseEngineDocumentByWooId).toHaveBeenNthCalledWith(2, 'customers', 7);

		fireEvent.click(screen.getByTestId('missing-customer'));
		fireEvent.click(screen.getByTestId('missing-cashier'));
		expect(mockForceRefresh).toHaveBeenNthCalledWith(1, mockManager, 42, 'customer');
		expect(mockForceRefresh).toHaveBeenNthCalledWith(2, mockManager, 7, 'cashier');
	});
});
