/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { QueryStateProvider, useQueryState } from '../../../../query';
import { FilterBar } from './filter-bar';

jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => ({}) }));
jest.mock('../../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../../contexts/app-state', () => ({
	useStoreSession: () => ({ wpCredentials: { id: 7 } }),
}));
jest.mock('../../../../hooks/use-store-day', () => ({
	useStoreDay: () => ({
		presets: () => ({ today: { from: 'store-midnight', to: 'store-end' } }),
		rangeToFilter: (range: unknown) => range,
	}),
}));
jest.mock('../../hooks/use-engine-document', () => ({ useEngineRecordByWooId: jest.fn() }));
jest.mock('../../hooks/use-guest-customer', () => ({ useGuestCustomer: jest.fn() }));
jest.mock('../../hooks/store-list-resource', () => ({ storeListResource: jest.fn() }));
jest.mock('../force-refresh-filter-customer', () => ({ forceRefreshFilterCustomer: jest.fn() }));
jest.mock('../../components/order/filter-bar/status-pill', () => ({ StatusPill: () => null }));
jest.mock('../../components/order/filter-bar/customer-pill', () => ({ CustomerPill: () => null }));
jest.mock('../../components/order/filter-bar/cashier-pill', () => ({ CashierPill: () => null }));
jest.mock('../../components/order/filter-bar/store-pill', () => ({ StorePill: () => null }));
jest.mock('../../components/order/filter-bar/register-pill', () => ({ RegisterPill: () => null }));
jest.mock('../../components/order/filter-bar/date-range-pill', () => ({
	DateRangePill: () => null,
}));
function Probe() {
	return <output data-testid="filters">{JSON.stringify(useQueryState<'orders'>().filters)}</output>;
}
function filters() {
	return JSON.parse(screen.getByTestId('filters').textContent ?? '{}');
}
it('toggles the two existing filter groups, counts groups once, and clears all', () => {
	render(
		<QueryStateProvider
			collection="orders"
			initialPageSize={10}
			initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
		>
			<FilterBar initialFilters={{}} />
			<Probe />
		</QueryStateProvider>
	);
	expect(screen.queryByTestId('orders-filter-clear-all')).toBeNull();
	fireEvent.click(screen.getByTestId('order-filter-today'));
	expect(filters()).toEqual({ dateRange: { from: 'store-midnight', to: 'store-end' } });
	expect(screen.getByTestId('order-filter-today').getAttribute('aria-pressed')).toBe('true');
	expect(screen.queryByTestId('orders-filter-clear-all')).toBeNull();
	fireEvent.click(screen.getByTestId('order-filter-mine'));
	expect(filters().cashier).toBe('7');
	fireEvent.click(screen.getByTestId('orders-filter-clear-all'));
	expect(filters()).toEqual({});
	fireEvent.click(screen.getByTestId('order-filter-mine'));
	fireEvent.click(screen.getByTestId('order-filter-mine'));
	expect(filters()).toEqual({});
	fireEvent.click(screen.getByTestId('order-filter-today'));
	fireEvent.click(screen.getByTestId('order-filter-today'));
	expect(filters()).toEqual({});
});

it('reads My sales as on at rest and counts only groups the cashier set, so Clear all is not there at rest', () => {
	render(
		<QueryStateProvider
			collection="orders"
			initialPageSize={10}
			initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			initialFilters={{ cashier: '7', store: '1' }}
		>
			<FilterBar initialFilters={{ cashier: '7', store: '1' }} />
			<Probe />
		</QueryStateProvider>
	);
	expect(screen.getByTestId('order-filter-mine').getAttribute('aria-pressed')).toBe('true');
	expect(screen.queryByTestId('orders-filter-clear-all')).toBeNull();
	fireEvent.click(screen.getByTestId('order-filter-today'));
	expect(screen.queryByTestId('orders-filter-clear-all')).toBeNull();
	fireEvent.click(screen.getByTestId('order-filter-mine'));
	fireEvent.click(screen.getByTestId('orders-filter-clear-all'));
	expect(filters()).toEqual({ cashier: '7', store: '1' });
});
