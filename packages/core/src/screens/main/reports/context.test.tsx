/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import { ObservableResource } from 'observable-hooks';
import { of } from 'rxjs';

import {
	ReportsProvider,
	ReportsScopeProvider,
	useReportsBinding,
	useReportsData,
	useReportsPeriod,
	useReportsScope,
	useReportsSelection,
} from './context';
import { QueryStateProvider, useQueryStateActions } from '../../../query';

let mockZone = 'UTC';
// The provider reads the viewed store's precision through useDocField; the app-state mock's
// store is a plain object, so the field is read directly.
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useDocField: (doc: Record<string, unknown> | undefined, pick: (row: never) => unknown) =>
		doc ? pick(doc as never) : undefined,
}));
jest.mock('../../../contexts/app-state', () => ({
	useAppState: () => ({ site: { timezone_string: mockZone, gmt_offset: '0' }, store: {} }),
}));
jest.mock('../../../hooks/use-local-date', () => ({
	convertUTCStringToLocalDate: (value: string) => new Date(value),
	convertLocalDateToUTCString: (value: Date) => value.toISOString(),
}));

const orders = [
	{ uuid: 'one', total: 'legacy-one' },
	{ uuid: 'two', total: 'legacy-two' },
] as import('@wcpos/database').OrderDocument[];
const binding = {
	resource: new ObservableResource(
		of({
			hits: orders.map((document) => ({
				id: document.uuid,
				document,
				record: {
					uuid: document.uuid,
					payload: {
						total: `engine-${document.uuid}`,
						status: document.uuid === 'one' ? 'completed' : 'processing',
					},
				},
			})),
		})
	),
};
const DataProvider = ReportsProvider as unknown as React.ComponentType<{
	binding: { resource: unknown };
	comparisonBinding: { resource: unknown };
	children: React.ReactNode;
}>;

function Provider({
	binding,
	children,
}: React.PropsWithChildren<{ binding: { resource: unknown } }>) {
	return (
		<ReportsScopeProvider>
			<DataProvider binding={binding} comparisonBinding={binding}>
				{children}
			</DataProvider>
		</ReportsScopeProvider>
	);
}

function Probe() {
	const data = useReportsData();
	const { setStatusMode } = useReportsScope();
	const selection = useReportsSelection();
	const reports = { ...data, ...selection };
	const actions = useQueryStateActions<'orders'>();
	return (
		<div>
			<button data-testid="all-statuses" onClick={() => setStatusMode('all')} />
			<div data-testid="all-orders">{reports.allOrders.map((order) => order.uuid).join(',')}</div>
			<div data-testid="selected-orders">
				{reports.selectedOrders.map((order) => order.uuid).join(',')}
			</div>
			<div data-testid="date-range">
				{`${reports.dateRange.start.toISOString()}|${reports.dateRange.end.toISOString()}`}
			</div>
			<button
				data-testid="exclude-one"
				onClick={() => reports.setUnselectedRowIds({ one: true })}
			/>
			<button
				data-testid="change-date"
				onClick={() =>
					actions.setFilter('dateRange', {
						from: '2026-07-10T00:00:00.000Z',
						to: '2026-07-11T23:59:59.999Z',
					})
				}
			/>
		</div>
	);
}

function PayloadProbe() {
	const { allOrders } = useReportsData();
	return <div data-testid="order-totals">{allOrders.map((order) => order.total).join(',')}</div>;
}

describe('ReportsProvider binding context', () => {
	it('maps report rows from engine record payloads rather than legacy documents', () => {
		render(
			<QueryStateProvider
				collection="orders"
				initialPageSize={Number.MAX_SAFE_INTEGER}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			>
				<React.Suspense fallback={null}>
					<Provider binding={binding}>
						<PayloadProbe />
					</Provider>
				</React.Suspense>
			</QueryStateProvider>
		);

		expect(screen.getByTestId('order-totals').textContent).toBe('engine-one,engine-two');
	});

	it('derives orders, selection, and dates from the binding result plus query state', () => {
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
				<React.Suspense fallback={null}>
					<Provider binding={binding}>
						<Probe />
					</Provider>
				</React.Suspense>
			</QueryStateProvider>
		);

		expect(screen.getByTestId('all-orders').textContent).toBe('one,two');
		expect(screen.getByTestId('selected-orders').textContent).toBe('one,two');
		expect(screen.getByTestId('date-range').textContent).toBe(
			'2026-07-01T00:00:00.000Z|2026-07-02T23:59:59.999Z'
		);

		fireEvent.click(screen.getByTestId('exclude-one'));
		expect(screen.getByTestId('selected-orders').textContent).toBe('two');

		fireEvent.click(screen.getByTestId('change-date'));
		expect(screen.getByTestId('date-range').textContent).toBe(
			'2026-07-10T00:00:00.000Z|2026-07-11T23:59:59.999Z'
		);
	});

	/**
	 * `ReportsSyncProgress` reads nothing but `binding`, and the binding does not change when
	 * the cashier ticks a row — but the whole bundle used to be republished together, so it
	 * re-rendered on every selection change and every order emission.
	 *
	 * The consumer is memoised with no props, so a parent render alone cannot reach it.
	 */
	it('does not re-render a binding-only consumer when the row selection changes', () => {
		const onBindingRender = jest.fn();
		const BindingConsumer = React.memo(function BindingConsumer() {
			useReportsBinding();
			onBindingRender();
			return null;
		});

		function SelectionButton() {
			const { setUnselectedRowIds } = useReportsSelection();
			return <button data-testid="exclude" onClick={() => setUnselectedRowIds({ one: true })} />;
		}

		render(
			<QueryStateProvider
				collection="orders"
				initialPageSize={Number.MAX_SAFE_INTEGER}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			>
				<React.Suspense fallback={null}>
					<Provider binding={binding}>
						<BindingConsumer />
						<SelectionButton />
					</Provider>
				</React.Suspense>
			</QueryStateProvider>
		);

		const rendersBefore = onBindingRender.mock.calls.length;
		expect(rendersBefore).toBeGreaterThan(0);

		fireEvent.click(screen.getByTestId('exclude'));

		expect(onBindingRender).toHaveBeenCalledTimes(rendersBefore);
	});
});

// Removing the device status set would include pending/cancelled orders in the default figure.
it('counts completed and processing, never pending or cancelled by default', () => {
	const statusBinding = {
		resource: new ObservableResource(
			of({
				hits: [
					'completed',
					'processing',
					'pending',
					'on-hold',
					'cancelled',
					'refunded',
					'failed',
					'draft',
				].map((status) => ({ record: { uuid: status, payload: { status, total: '10' } } })),
			})
		),
	};
	render(
		<QueryStateProvider
			collection="orders"
			initialPageSize={Number.MAX_SAFE_INTEGER}
			initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
		>
			<React.Suspense fallback={null}>
				<Provider binding={statusBinding}>
					<Probe />
				</Provider>
			</React.Suspense>
		</QueryStateProvider>
	);
	expect(screen.getByTestId('selected-orders').textContent).toBe('completed,processing');
	fireEvent.click(screen.getByTestId('all-statuses'));
	expect(screen.getByTestId('selected-orders').textContent).toBe(
		'completed,processing,pending,on-hold'
	);
});

// Replacing store calendar arithmetic with elapsed/device days breaks these DST and month bounds.
it.each([
	[
		'day',
		'2026-03-09T04:00:00.000Z',
		'2026-03-10T03:59:59.999Z',
		'2026-03-08T05:00:00.000Z',
		'2026-03-09T03:59:59.999Z',
	],
	[
		'week',
		'2026-03-09T04:00:00.000Z',
		'2026-03-16T03:59:59.999Z',
		'2026-03-02T05:00:00.000Z',
		'2026-03-09T03:59:59.999Z',
	],
	[
		'month',
		'2026-03-01T05:00:00.000Z',
		'2026-04-01T03:59:59.999Z',
		'2026-02-01T05:00:00.000Z',
		'2026-03-01T04:59:59.999Z',
	],
	[
		'short month',
		'2026-02-01T05:00:00.000Z',
		'2026-03-01T04:59:59.999Z',
		'2026-01-01T05:00:00.000Z',
		'2026-02-01T04:59:59.999Z',
	],
	// A custom range keeps its calendar-day count from a start a month earlier, whatever the
	// months' lengths (Codex review, PR 2a): 45 days stay 45, 59 days stay 59.
	[
		'custom 45-day (Jan 15 to Feb 28)',
		'2026-01-15T05:00:00.000Z',
		'2026-03-01T04:59:59.999Z',
		'2025-12-15T05:00:00.000Z',
		'2026-01-29T04:59:59.999Z',
	],
	[
		'custom 59-day (Jan 2 to Mar 1)',
		'2026-01-02T05:00:00.000Z',
		'2026-03-02T04:59:59.999Z',
		'2025-12-02T05:00:00.000Z',
		'2026-01-30T04:59:59.999Z',
	],
])(
	'derives the %s comparison in the viewed store zone',
	(_name, from, to, expectedFrom, expectedTo) => {
		mockZone = 'America/New_York';
		function Period() {
			const { comparisonRange } = useReportsPeriod();
			const { setCmp } = useReportsScope();
			return (
				<>
					<span data-testid="comparison-range">
						{comparisonRange.start.toISOString()}|{comparisonRange.end.toISOString()}
					</span>
					<button data-testid="last-weekday" onClick={() => setCmp('lastweek')} />
				</>
			);
		}
		try {
			render(
				<QueryStateProvider
					collection="orders"
					initialPageSize={Number.MAX_SAFE_INTEGER}
					initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
					initialFilters={{ dateRange: { from, to } }}
				>
					<ReportsScopeProvider>
						<Period />
					</ReportsScopeProvider>
				</QueryStateProvider>
			);
			expect(screen.getByTestId('comparison-range').textContent).toBe(
				`${expectedFrom}|${expectedTo}`
			);
			fireEvent.click(screen.getByTestId('last-weekday'));
			expect(screen.getByTestId('comparison-range').textContent).toBe(
				_name === 'day'
					? '2026-03-02T05:00:00.000Z|2026-03-03T04:59:59.999Z'
					: `${expectedFrom}|${expectedTo}`
			);
		} finally {
			mockZone = 'UTC';
		}
	}
);

// Replacing the picker's preset matching with duration alone calls April 1–2 a week.
it('compares a clamped early This month with the same bounds in the previous month', () => {
	jest.useFakeTimers().setSystemTime(new Date('2026-04-02T16:00:00Z'));
	mockZone = 'America/New_York';
	function Period() {
		const { period, comparisonRange } = useReportsPeriod();
		return (
			<span data-testid="early-month">
				{period}|{comparisonRange.start.toISOString()}|{comparisonRange.end.toISOString()}
			</span>
		);
	}
	try {
		render(
			<QueryStateProvider
				collection="orders"
				initialPageSize={Number.MAX_SAFE_INTEGER}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
				initialFilters={{ dateRange: { from: '2026-04-01T04:00:00Z', to: '2026-04-03T03:59:59Z' } }}
			>
				<ReportsScopeProvider>
					<Period />
				</ReportsScopeProvider>
			</QueryStateProvider>
		);
		expect(screen.getByTestId('early-month').textContent).toBe(
			'month|2026-03-01T05:00:00.000Z|2026-03-03T04:59:59.999Z'
		);
	} finally {
		mockZone = 'UTC';
		jest.useRealTimers();
	}
});
