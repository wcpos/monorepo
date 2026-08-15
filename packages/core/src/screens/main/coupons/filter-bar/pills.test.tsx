/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { endOfDay, startOfDay } from 'date-fns';
import { fireEvent, render, screen } from '@testing-library/react';

import { QueryStateProvider, useQueryState } from '../../../../query';
import { DateRangePill } from './date-range-pill';
import { DiscountTypePill } from './discount-type-pill';
import { StatusPill } from './status-pill';

import type { FiltersOf } from '../../../../query';

let mockSelectedOption = { value: 'publish', label: 'coupons.publish' };

jest.mock('@wcpos/components/button', () => ({
	ButtonPill: ({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) => (
		<div>
			{children}
			<button data-testid="clear-filter" onClick={onRemove} />
		</div>
	),
	ButtonText: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
jest.mock('@wcpos/components/select', () => ({
	Select: ({
		children,
		onValueChange,
	}: {
		children: React.ReactNode;
		onValueChange: (option: { value: string; label: string }) => void;
	}) => (
		<div>
			<button data-testid="select-filter" onClick={() => onValueChange(mockSelectedOption)} />
			{children}
		</div>
	),
	SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	SelectItem: () => null,
	SelectPrimitiveTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@wcpos/components/popover', () => ({
	Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	PopoverTrigger: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../components/order/filter-bar/calendar', () => ({
	DateRangeCalendar: ({ onSelect }: { onSelect: (range: { from: Date; to: Date }) => void }) => (
		<button
			data-testid="select-date-range"
			onClick={() =>
				onSelect({
					from: new Date(2026, 6, 1, 12),
					to: new Date(2026, 6, 3, 12),
				})
			}
		/>
	),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => (key: string) => key,
}));
jest.mock('../../../../hooks/use-local-date', () => ({
	convertLocalDateToUTCString: (date: Date) => date.toISOString(),
	convertUTCStringToLocalDate: (value: string) => new Date(value),
	useLocalDate: () => ({ formatDate: (date: Date) => date.toISOString() }),
}));

function CouponFilterProbe() {
	const filters = useQueryState<'coupons', FiltersOf<'coupons'>>((state) => state.filters);
	return <div data-testid="coupon-filters">{JSON.stringify(filters)}</div>;
}

function renderPill(pill: React.ReactNode) {
	return render(
		<QueryStateProvider
			collection="coupons"
			initialPageSize={10}
			initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
		>
			{pill}
			<CouponFilterProbe />
		</QueryStateProvider>
	);
}

function filters(): FiltersOf<'coupons'> {
	return JSON.parse(
		screen.getByTestId('coupon-filters').textContent ?? '{}'
	) as FiltersOf<'coupons'>;
}

describe('coupon filter pills', () => {
	it('sets and clears the status filter through query-state actions', () => {
		mockSelectedOption = { value: 'publish', label: 'coupons.publish' };
		const StoreStatusPill = StatusPill as unknown as React.ComponentType;
		renderPill(<StoreStatusPill />);

		fireEvent.click(screen.getByTestId('select-filter'));
		expect(filters()).toEqual({ status: 'publish' });

		fireEvent.click(screen.getByTestId('clear-filter'));
		expect(filters()).toEqual({});
	});

	it('sets and clears the discount type filter through query-state actions', () => {
		mockSelectedOption = { value: 'fixed_cart', label: 'coupons.fixed_cart' };
		const StoreDiscountTypePill = DiscountTypePill as unknown as React.ComponentType;
		renderPill(<StoreDiscountTypePill />);

		fireEvent.click(screen.getByTestId('select-filter'));
		expect(filters()).toEqual({ discount_type: 'fixed_cart' });

		fireEvent.click(screen.getByTestId('clear-filter'));
		expect(filters()).toEqual({});
	});

	it('sets and clears the expiry date range through query-state actions', () => {
		const StoreDateRangePill = DateRangePill as unknown as React.ComponentType;
		renderPill(<StoreDateRangePill />);

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
});
