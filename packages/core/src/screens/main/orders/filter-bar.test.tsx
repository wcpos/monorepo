/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { QueryStateProvider, useQueryState, useQueryStateActions } from '../../../query';
import { FilterBar } from './filter-bar';

jest.mock('expo-haptics', () => ({}));
jest.mock('@wcpos/components/loader', () => ({ Loader: () => null }));
jest.mock('@rn-primitives/slot', () => ({ Slot: 'span' }));
jest.mock('@wcpos/components/icon', () => ({ Icon: () => null }));
// The Button mock exposes its variant: the 10-30 ruling (#3126) makes a bar-level
// Clear all a link, never a box, and the Orders bar follows it (Paul, 2026-10-31).
jest.mock('@wcpos/components/button', () => ({
	Button: ({ children, testID, onPress, variant }: any) => (
		<button data-testid={testID} data-variant={variant} onClick={onPress}>
			{children}
		</button>
	),
	ButtonText: ({ children }: any) => <span>{children}</span>,
}));
jest.mock('@wcpos/query', () => ({ useQueryRuntime: () => ({}) }));
jest.mock('../../../contexts/translations', () => ({ useT: () => (key: string) => key }));
jest.mock('../../../contexts/app-state', () => ({
	useStoreSession: () => ({ wpCredentials: { id: 7 } }),
}));
jest.mock('@wcpos/query/record-readers', () => ({ useEngineRecordByWooId: jest.fn() }));
jest.mock('../hooks/use-guest-customer', () => ({ useGuestCustomer: jest.fn() }));
jest.mock('../hooks/store-list-resource', () => ({ storeListResource: jest.fn() }));
jest.mock('./force-refresh-filter-customer', () => ({ forceRefreshFilterCustomer: jest.fn() }));
jest.mock('../components/order/filter-bar/status-pill', () => ({ StatusPill: () => null }));
jest.mock('../components/order/filter-bar/customer-pill', () => ({ CustomerPill: () => null }));
jest.mock('../components/order/filter-bar/cashier-pill', () => ({ CashierPill: () => null }));
jest.mock('../components/order/filter-bar/store-pill', () => ({ StorePill: () => null }));
jest.mock('../components/order/filter-bar/register-pill', () => ({ RegisterPill: () => null }));
jest.mock('../components/order/filter-bar/payment-method-pill', () => ({
	PaymentMethodPill: () => null,
}));
jest.mock('../components/order/filter-bar/date-range-pill', () => ({
	DateRangePill: () => null,
}));
function Probe() {
	return <output data-testid="filters">{JSON.stringify(useQueryState<'orders'>().filters)}</output>;
}
function filters() {
	return JSON.parse(screen.getByTestId('filters').textContent ?? '{}');
}
// The pills are mocked away; these stand in for the cashier setting a filter through one.
function Setter() {
	const actions = useQueryStateActions<'orders'>();
	return (
		<>
			<button data-testid="set-status" onClick={() => actions.setFilter('status', 'completed')} />
			<button data-testid="set-cashier" onClick={() => actions.setFilter('cashier', '7')} />
			<button data-testid="clear-cashier" onClick={() => actions.clearFilter('cashier')} />
		</>
	);
}
function mount(initialFilters: Record<string, string> = {}) {
	render(
		<QueryStateProvider
			collection="orders"
			initialPageSize={10}
			initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			initialFilters={initialFilters}
		>
			<FilterBar initialFilters={initialFilters} />
			<Setter />
			<Probe />
		</QueryStateProvider>
	);
}
it('carries no Today or My sales chip: the date and cashier pills are the only doors', () => {
	mount();
	expect(screen.queryByTestId('order-filter-today')).toBeNull();
	expect(screen.queryByTestId('order-filter-mine')).toBeNull();
});

it('shows Clear all once two groups are set, and Clear all empties them', () => {
	mount();
	expect(screen.queryByTestId('orders-filter-clear-all')).toBeNull();
	fireEvent.click(screen.getByTestId('set-status'));
	expect(filters()).toEqual({ status: 'completed' });
	expect(screen.queryByTestId('orders-filter-clear-all')).toBeNull();
	fireEvent.click(screen.getByTestId('set-cashier'));
	expect(filters().cashier).toBe('7');
	// A link, not a box: the same shape as the POS filter bar's Clear all (#3126).
	expect(screen.getByTestId('orders-filter-clear-all').getAttribute('data-variant')).toBe('link');
	fireEvent.click(screen.getByTestId('orders-filter-clear-all'));
	expect(filters()).toEqual({});
});

it('counts only groups the cashier changed from the resting scope, and Clear all returns to it', () => {
	mount({ cashier: '7', store: '1' });
	expect(screen.queryByTestId('orders-filter-clear-all')).toBeNull();
	fireEvent.click(screen.getByTestId('set-status'));
	expect(screen.queryByTestId('orders-filter-clear-all')).toBeNull();
	fireEvent.click(screen.getByTestId('clear-cashier'));
	fireEvent.click(screen.getByTestId('orders-filter-clear-all'));
	expect(filters()).toEqual({ cashier: '7', store: '1' });
});
