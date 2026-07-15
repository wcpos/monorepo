/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { endOfDay, startOfDay } from 'date-fns';
import { fireEvent, render, screen } from '@testing-library/react';
import { ObservableResource } from 'observable-hooks';
import { of } from 'rxjs';

import type { CustomerDocument, StoreDocument } from '@wcpos/database';

import { QueryStateProvider, useQueryState } from '../../../../../query';
import { CashierPill } from './cashier-pill';
import { CustomerPill } from './customer-pill';
import { DateRangePill } from './date-range-pill';
import { StatusPill } from './status-pill';
import { StorePill } from './store-pill';

import type { FiltersOf } from '../../../../../query';

let mockComboboxOption = { value: '42', item: { id: 42, first_name: 'Ada' } };
let mockSelectOption = { value: 'processing', label: 'Processing' };
const mockSetCashierSearch = jest.fn();
const mockCashierResource = { kind: 'cashier-search-resource' };
let mockCustomerListProps: Record<string, unknown> = {};

jest.mock('../../../../../query', () => {
	const actual = jest.requireActual('../../../../../query');
	return {
		...actual,
		useSearchSelect: jest.fn(() => ({
			resource: mockCashierResource,
			search: '',
			setSearch: mockSetCashierSearch,
		})),
	};
});
jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) => (
		<div>
			{children}
			<button data-testid="clear-filter" onClick={onRemove} />
		</div>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/combobox', () => ({
	Combobox: ({
		children,
		onValueChange,
	}: {
		children: React.ReactNode;
		onValueChange: (option: typeof mockComboboxOption) => void;
	}) => (
		<div>
			<button data-testid="select-combobox" onClick={() => onValueChange(mockComboboxOption)} />
			{children}
		</div>
	),
	ComboboxContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	ComboboxInput: ({
		value,
		onChangeText,
	}: {
		value: string;
		onChangeText: (value: string) => void;
	}) => (
		<input
			data-testid="cashier-search"
			value={value}
			onChange={(event) => onChangeText(event.currentTarget.value)}
		/>
	),
	ComboboxTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/select', () => ({
	Select: ({
		children,
		onValueChange,
	}: {
		children: React.ReactNode;
		onValueChange: (option: typeof mockSelectOption) => void;
	}) => (
		<div>
			<button data-testid="select-option" onClick={() => onValueChange(mockSelectOption)} />
			{children}
		</div>
	),
	SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectItem: () => null,
	SelectLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectPrimitiveTrigger: ({ children }: { children: React.ReactNode }) => children,
	SelectSeparator: () => null,
}));
jest.mock('@wcpos/components/popover', () => ({
	Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	PopoverTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/suspense', () => ({
	Suspense: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('./calendar', () => ({
	DateRangeCalendar: ({ onSelect }: { onSelect: (range: { from: Date; to: Date }) => void }) => (
		<button
			data-testid="select-date-range"
			onClick={() => onSelect({ from: new Date(2026, 6, 1, 12), to: new Date(2026, 6, 3, 12) })}
		/>
	),
}));
jest.mock('../../customer-select', () => ({
	CustomerSearch: () => null,
	CustomerList: (props: Record<string, unknown>) => {
		mockCustomerListProps = props;
		return null;
	},
}));
jest.mock('../../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../../hooks/use-customer-name-format', () => ({
	useCustomerNameFormat: () => ({
		format: (customer: { id?: number }) => `customer-${customer.id}`,
	}),
}));
jest.mock('../../../hooks/use-order-status-label', () => ({
	useOrderStatusLabel: () => ({ items: [{ value: 'processing', label: 'Processing' }] }),
}));
jest.mock('../../../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: (date: Date) => date.toISOString(),
	convertUTCStringToLocalDate: (value: string) => new Date(value),
	useLocalDate: () => ({ formatDate: (date: Date) => date.toISOString() }),
}));

function OrderFilterProbe() {
	const filters = useQueryState<'orders', FiltersOf<'orders'>>((state) => state.filters);
	return <div data-testid="order-filters">{JSON.stringify(filters)}</div>;
}

function renderPill(pill: React.ReactNode, initialFilters?: Partial<FiltersOf<'orders'>>) {
	return render(
		<QueryStateProvider
			collection="orders"
			initialPageSize={10}
			initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			initialFilters={initialFilters}
		>
			<React.Suspense fallback={null}>{pill}</React.Suspense>
			<OrderFilterProbe />
		</QueryStateProvider>
	);
}

function filters(): FiltersOf<'orders'> {
	return JSON.parse(screen.getByTestId('order-filters').textContent ?? '{}') as FiltersOf<'orders'>;
}

describe('order filter pills', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockCustomerListProps = {};
		mockComboboxOption = { value: '42', item: { id: 42, first_name: 'Ada' } };
		mockSelectOption = { value: 'processing', label: 'Processing' };
	});

	it('sets and clears status', () => {
		renderPill(<StatusPill />);
		fireEvent.click(screen.getByTestId('select-option'));
		expect(filters()).toEqual({ status: 'processing' });
		fireEvent.click(screen.getByTestId('clear-filter'));
		expect(filters()).toEqual({});
	});

	it('sets and clears customer_id', () => {
		const resource = new ObservableResource(of({ id: 42 } as CustomerDocument));
		renderPill(<CustomerPill resource={resource} guestCustomer={{ id: 0 } as CustomerDocument} />);
		fireEvent.click(screen.getByTestId('select-combobox'));
		expect(filters()).toEqual({ customer_id: 42 });
		fireEvent.click(screen.getByTestId('clear-filter'));
		expect(filters()).toEqual({});
	});

	it('sets and clears cashier and binds its dropdown through useSearchSelect', () => {
		mockComboboxOption = { value: ' 0007 ', item: { id: 7, first_name: 'Grace' } };
		const resource = new ObservableResource(of({ id: 7 } as CustomerDocument));
		renderPill(<CashierPill resource={resource} />);

		fireEvent.change(screen.getByTestId('cashier-search'), { target: { value: 'gra' } });
		expect(mockSetCashierSearch).toHaveBeenCalledWith('gra');
		expect(mockCustomerListProps).toMatchObject({
			resource: mockCashierResource,
			withGuest: false,
		});
		fireEvent.click(screen.getByTestId('select-combobox'));
		expect(filters()).toEqual({ cashier: 7 });
		fireEvent.click(screen.getByTestId('clear-filter'));
		expect(filters()).toEqual({});
	});

	it('sets and clears the UTC date range', () => {
		renderPill(<DateRangePill />);
		fireEvent.click(screen.getByTestId('select-date-range'));
		expect(filters()).toEqual({
			dateRange: {
				from: startOfDay(new Date(2026, 6, 1, 12)).toISOString(),
				to: endOfDay(new Date(2026, 6, 3, 12)).toISOString(),
			},
		});
		fireEvent.click(screen.getByTestId('clear-filter'));
		expect(filters()).toEqual({});
	});

	it('lets reports override date removal with its bounded-window reset', () => {
		const onRemove = jest.fn();
		const ReportsDateRangePill = DateRangePill as React.ComponentType<{ onRemove: () => void }>;
		renderPill(<ReportsDateRangePill onRemove={onRemove} />, {
			dateRange: { from: '2026-07-01', to: '2026-07-03' },
		});

		fireEvent.click(screen.getByTestId('clear-filter'));

		expect(onRemove).toHaveBeenCalledTimes(1);
		expect(filters()).toEqual({
			dateRange: { from: '2026-07-01', to: '2026-07-03' },
		});
	});

	it('sets either a numeric store or created_via value and clears the composite field', () => {
		const stores = new ObservableResource(of([{ id: 12, name: 'Madrid' } as StoreDocument]));
		mockSelectOption = { value: '12', label: 'Madrid' };
		const { unmount } = renderPill(<StorePill resource={stores} />);
		fireEvent.click(screen.getByTestId('select-option'));
		expect(filters()).toEqual({ store: '12' });
		fireEvent.click(screen.getByTestId('clear-filter'));
		expect(filters()).toEqual({});
		unmount();

		mockSelectOption = { value: 'checkout', label: 'Online store' };
		renderPill(<StorePill resource={stores} />);
		fireEvent.click(screen.getByTestId('select-option'));
		expect(filters()).toEqual({ store: 'checkout' });
	});

	it('escalates missing active customer and cashier labels', () => {
		const missing = new ObservableResource(of(null as unknown as CustomerDocument));
		const onMissingCustomer = jest.fn();
		const { unmount } = renderPill(
			<CustomerPill
				resource={missing}
				guestCustomer={{ id: 0 } as CustomerDocument}
				onMissing={onMissingCustomer}
			/>,
			{ customer_id: 42 }
		);
		expect(onMissingCustomer).toHaveBeenCalledTimes(1);
		unmount();

		const onMissingCashier = jest.fn();
		renderPill(<CashierPill resource={missing} onMissing={onMissingCashier} />, { cashier: '7' });
		expect(onMissingCashier).toHaveBeenCalledTimes(1);
	});
});
