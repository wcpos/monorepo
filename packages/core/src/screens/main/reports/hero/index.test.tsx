/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import { ObservableResource } from 'observable-hooks';
import { of, Subject } from 'rxjs';

import { Hero } from './index';
import {
	ReportsComparison,
	ReportsProvider,
	ReportsScopeProvider,
	useReportsData,
	useReportsScope,
	useReportsSelection,
} from '../context';
import { QueryStateProvider, useQueryState } from '../../../../query';

import type { ReportOrder } from '../context';

const mockPrint = jest.fn();
let mockCashiersPending = false;
const mockPendingCashiers = new Promise(() => {});
const mockCashiers = of([{ id: 7, display_name: 'Priya' }]);
const mockStore = {
	id: 9,
	timezone: 'America/New_York',
	currency: 'GBP',
	currency_pos: 'left',
	price_num_decimals: 2,
	price_decimal_sep: '.',
	price_thousand_sep: ',',
};
// The shared boundary pulls in a tooltip primitive jest cannot parse; the real react-error-boundary
// behind it is what the comparison-failure case exercises.
jest.mock('@wcpos/components/error-boundary', () => ({
	ErrorBoundary: jest.requireActual('react-error-boundary').ErrorBoundary,
}));
jest.mock('../sync-progress', () => ({ ReportsSyncProgress: () => null }));
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => ({ store: mockStore, site: { populate$: () => mockCashiers } }),
	useStoreSession: () => ({
		site: {
			populate$: () => {
				if (mockCashiersPending) throw mockPendingCashiers;
				return mockCashiers;
			},
		},
	}),
}));
jest.mock('@wcpos/query', () => ({
	useDocField: (
		source: Record<string, unknown> | undefined,
		select: (v: Record<string, unknown>) => unknown
	) => source && select(source),
}));
jest.mock('../../../../contexts/theme', () => ({ useTheme: () => ({ screenSize: 'sm' }) }));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('../../../../hooks/use-local-date', () => ({
	...jest.requireActual('../../../../hooks/use-local-date'),
	useLocalDate: () => ({ formatDate: jest.requireActual('date-fns').format }),
}));
jest.mock('../chart', () => ({
	Chart: ({ comparison = false }: { comparison?: boolean }) => {
		const { chartView } = useReportsScope();
		const { wholeComparisonOrders } = useReportsData();
		return (
			<div
				data-testid="existing-chart"
				data-comparison={comparison ? wholeComparisonOrders.length : 'unavailable'}
			>
				{chartView}
			</div>
		);
	},
}));
jest.mock('../report/template', () => ({ ZReport: () => null }));
jest.mock('../report/use-report-print', () => ({
	useReportPrint: () => ({ print: mockPrint, isPrinting: false, contentRef: { current: null } }),
}));
jest.mock('@wcpos/components/text', () => ({ Text: jest.requireActual('react-native').Text }));
jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
jest.mock('@wcpos/components/icon-button', () => ({
	IconButton: ({ testID, onPress }: { testID: string; onPress: () => void }) => (
		<button data-testid={testID} onClick={onPress} />
	),
}));
jest.mock('@wcpos/components/button', () => ({
	ButtonText: jest.requireActual('react-native').Text,
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
jest.mock('@wcpos/components/popover', () => {
	const C = React.createContext({ open: false, setOpen: (_value: boolean) => {} });
	return {
		Popover: ({ children }: React.PropsWithChildren) => {
			const [open, setOpen] = React.useState(false);
			return <C.Provider value={{ open, setOpen }}>{children}</C.Provider>;
		},
		PopoverTrigger: React.forwardRef(function Trigger({ children }: React.PropsWithChildren, ref) {
			const { open, setOpen } = React.useContext(C);
			React.useImperativeHandle(ref, () => ({
				close: () => setOpen(false),
				open: () => setOpen(true),
			}));
			return React.cloneElement(children as React.ReactElement<{ onPress: () => void }>, {
				onPress: () => setOpen(!open),
			});
		}),
		PopoverContent: ({ children, testID }: React.PropsWithChildren<{ testID: string }>) =>
			React.useContext(C).open ? <div data-testid={testID}>{children}</div> : null,
	};
});
const current = [
	{
		uuid: 'one',
		total: '20',
		status: 'completed',
		line_items: [{ quantity: 2 }, { quantity: NaN }],
	},
	{ uuid: 'two', total: '10', status: 'processing', line_items: [{ quantity: 1 }] },
	{ uuid: 'pending', total: '5', status: 'pending', line_items: [] },
] as ReportOrder[];
const previous = [
	{
		uuid: 'morning',
		total: '20',
		status: 'completed',
		date_created_gmt: '2026-07-14T13:00:00',
		line_items: [{ quantity: 1 }],
	},
	{
		uuid: 'late',
		total: '80',
		status: 'processing',
		date_created_gmt: '2026-07-14T22:00:00',
		line_items: [{ quantity: 8 }],
	},
] as ReportOrder[];
function resource(orders: ReportOrder[]) {
	return new ObservableResource(
		of({ hits: orders.map(({ uuid, ...payload }) => ({ record: { uuid, payload } })) })
	);
}
function Probe() {
	const data = useReportsData();
	const { setUnselectedRowIds } = useReportsSelection();
	const state = useQueryState<'orders'>();
	return (
		<>
			<span data-testid="comparison-counts">
				{data.comparisonOrders.length}/{data.wholeComparisonOrders.length}
			</span>
			<span data-testid="cashier-filter">{state.filters.cashier ?? 'Everyone'}</span>
			<button
				data-testid="exclude"
				onClick={() => setUnselectedRowIds({ one: true, morning: true })}
			/>
		</>
	);
}
function setup({
	comparison = resource(previous),
	week = false,
	probe = true,
	cashier = undefined as string | undefined,
} = {}) {
	const Provider = ReportsProvider as unknown as React.ComponentType<
		React.PropsWithChildren<{
			binding: { resource: unknown };
			comparisonBinding: { resource: unknown };
		}>
	>;
	return render(
		<QueryStateProvider
			collection="orders"
			initialPageSize={Number.MAX_SAFE_INTEGER}
			initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			initialFilters={{
				store: '9',
				cashier,
				dateRange: {
					from: '2026-07-15T04:00:00',
					to: week ? '2026-07-22T03:59:59' : '2026-07-16T03:59:59',
				},
			}}
		>
			<ReportsScopeProvider>
				<React.Suspense fallback={null}>
					<Provider
						binding={{ resource: resource(current) }}
						comparisonBinding={{ resource: comparison }}
					>
						<Hero title={<span>Today</span>} />
						{probe && (
							<React.Suspense fallback={null}>
								<ReportsComparison>
									<Probe />
								</ReportsComparison>
							</React.Suspense>
						)}
					</Provider>
				</React.Suspense>
			</ReportsScopeProvider>
		</QueryStateProvider>
	);
}
beforeEach(() => {
	jest.useFakeTimers().setSystemTime(new Date('2026-07-15T16:00:00Z'));
	mockPrint.mockClear();
});
afterEach(() => jest.useRealTimers());
// Removing calculateTotals or the live-day cutoff changes all the displayed comparisons.
it('renders the figure, delta and three companions using the store currency and finite quantities', () => {
	setup();
	for (const [id, value] of Object.entries({
		total: '£30.00',
		delta: '+50.0% vs yesterday',
		orders: '2',
		average: '£15.00',
		items: '3',
		'orders-delta': '+1',
		'average-delta': '−£5.00',
		'items-delta': '+2',
	}))
		expect(screen.getByTestId(`hero-${id}`).textContent).toBe(value);
	expect(screen.getByTestId('existing-chart')).toBeTruthy();
	fireEvent.click(screen.getByTestId('hero-print'));
	expect(mockPrint).toHaveBeenCalledTimes(1);
});
it('shows a muted dash when the comparison figure is zero', () => {
	setup({ comparison: resource([]) });
	expect(screen.getByTestId('hero-delta').textContent).toBe('—');
});
// With nothing to compare with, the companions read the same dash, never a difference against nothing.
it('shows the dash on every companion when there are no comparison orders', () => {
	setup({ comparison: resource([]) });
	for (const id of ['orders-delta', 'average-delta', 'items-delta'])
		expect(screen.getByTestId(`hero-${id}`).textContent).toBe('—');
});
it('Every status adds pending to the figure and clearing restores completed and processing', () => {
	setup();
	fireEvent.click(screen.getByTestId('hero-chip-status'));
	fireEvent.click(screen.getByTestId('hero-status-all'));
	expect(screen.getByTestId('hero-total').textContent).toBe('£35.00');
	expect(screen.queryByTestId('hero-status-menu')).toBeNull();
	fireEvent.click(screen.getByTestId('hero-chip-status-clear'));
	expect(screen.getByTestId('hero-total').textContent).toBe('£30.00');
});
it('clears the cashier chip to Everyone', () => {
	setup({ cashier: '7' });
	expect(screen.getByTestId('hero-chip-cashier').textContent).toContain('Priya');
	fireEvent.click(screen.getByTestId('hero-chip-cashier-clear'));
	expect(screen.getByTestId('cashier-filter').textContent).toBe('Everyone');
});
it('keeps a week comparison chip non-pressable', () => {
	setup({ week: true });
	fireEvent.click(screen.getByTestId('hero-chip-compare'));
	expect(screen.queryByTestId('hero-compare-menu')).toBeNull();
	expect(screen.getByTestId('hero-chip-compare').textContent).toBe('vs the week before');
});
it('cuts a live comparison at store wall time but retains the whole period and ignores exclusions', () => {
	setup();
	expect(screen.getByTestId('comparison-counts').textContent).toBe('1/2');
	fireEvent.click(screen.getByTestId('exclude'));
	expect(screen.getByTestId('comparison-counts').textContent).toBe('1/2');
	expect(screen.getByTestId('hero-delta').textContent).toBe('−50.0% vs yesterday');
});
it('keeps the current figure and companions visible while comparison is suspended', () => {
	const pending = new ObservableResource(new Subject<{ hits: never[] }>());
	setup({ comparison: pending as unknown as ReturnType<typeof resource> });
	expect(screen.getByTestId('hero-total').textContent).toBe('£30.00');
	expect(screen.getByTestId('hero-orders').textContent).toBe('2');
	expect(screen.getByTestId('hero-delta-loading')).toBeTruthy();
	expect(screen.getByTestId('hero-orders-delta-loading')).toBeTruthy();
});

// The selected value must reopen its own menu; clearing it restores yesterday.
it('selects last weekday, marks the current row and clears back to yesterday', () => {
	setup();
	fireEvent.click(screen.getByTestId('hero-chip-compare'));
	fireEvent.click(screen.getByTestId('hero-compare-lastweek'));
	expect(screen.getByTestId('hero-delta').textContent).toContain('vs last Wednesday');
	expect(screen.queryByTestId('hero-compare-menu')).toBeNull();
	fireEvent.click(screen.getByTestId('hero-chip-compare-label'));
	expect(
		screen.getByTestId('hero-compare-lastweek').querySelector('[data-icon="check"]')
	).toBeTruthy();
	fireEvent.click(screen.getByTestId('hero-compare-lastweek'));
	expect(screen.queryByTestId('hero-compare-menu')).toBeNull();
	fireEvent.click(screen.getByTestId('hero-chip-compare-clear'));
	expect(screen.getByTestId('hero-chip-compare').textContent).toContain('vs yesterday');
});
it('selects a cashier from its own menu and closes it', () => {
	setup();
	fireEvent.click(screen.getByTestId('hero-chip-cashier'));
	expect(screen.getByTestId('hero-cashier-all').querySelector('[data-icon="check"]')).toBeTruthy();
	fireEvent.click(screen.getByTestId('hero-cashier-7'));
	expect(screen.getByTestId('hero-chip-cashier').textContent).toContain('Priya');
	expect(screen.getByTestId('cashier-filter').textContent).toBe('7');
	expect(screen.queryByTestId('hero-cashier-menu')).toBeNull();
});

it('keeps the figure visible while the cashier chip is suspended', () => {
	mockCashiersPending = true;
	try {
		setup();
		expect(screen.getByTestId('hero-cashier-loading')).toBeTruthy();
		expect(screen.getByTestId('hero-total').textContent).toBe('£30.00');
	} finally {
		mockCashiersPending = false;
	}
});
it('shows flat deltas in percent and the companions own units', () => {
	setup({
		comparison: resource(
			current
				.filter((order) => order.status !== 'pending')
				.map((order) => ({ ...order, date_created_gmt: '2026-07-14T08:00:00' }))
		),
	});
	expect(screen.getByTestId('hero-delta').textContent).toBe('±0% vs yesterday');
	for (const name of ['orders', 'average', 'items'])
		expect(screen.getByTestId(`hero-${name}-delta`).textContent).toBe('±0');
});
// The live cutoff moves with the clock, so a report left open does not compare against a stale hour.
it('advances a live comparison cutoff as the clock moves', () => {
	setup();
	expect(screen.getByTestId('comparison-counts').textContent).toBe('1/2');
	act(() => {
		jest.advanceTimersByTime(6 * 60 * 60 * 1000 + 60_000);
	});
	expect(screen.getByTestId('comparison-counts').textContent).toBe('2/2');
});
// Money differences are taken at the displayed precision: two figures that read the same never differ.
it('shows no money difference below the store precision', () => {
	setup({
		comparison: resource([
			{ ...previous[0], total: '15.004' },
			{ ...previous[0], uuid: 'other', total: '14.998' },
		] as ReportOrder[]),
	});
	expect(screen.getByTestId('hero-average').textContent).toBe('£15.00');
	expect(screen.getByTestId('hero-average-delta').textContent).toBe('±0');
});
// The percentage is rounded to its displayed tenth before the sign: a change below that reads flat.
it('reads a change below a tenth of a percent as flat', () => {
	setup({ comparison: resource([{ ...previous[0], total: '30.01' }] as ReportOrder[]) });
	expect(screen.getByTestId('hero-delta').textContent).toBe('±0% vs yesterday');
});
// Past the store's midnight the day is no longer live: the whole comparison day counts.
it('counts the whole comparison day once the store day rolls over', () => {
	const lateNight = {
		...previous[0],
		uuid: 'late-night',
		total: '5',
		// 23:59 in New York on the 14th.
		date_created_gmt: '2026-07-15T03:59:00',
	};
	setup({ comparison: resource([...previous, lateNight] as ReportOrder[]) });
	expect(screen.getByTestId('comparison-counts').textContent).toBe('1/3');
	act(() => {
		// 12:00 to 00:31 New York time, in minute ticks.
		jest.advanceTimersByTime(12 * 60 * 60 * 1000 + 31 * 60 * 1000);
	});
	expect(screen.getByTestId('comparison-counts').textContent).toBe('3/3');
});

it('switches the chart view for the visit without changing query filters', () => {
	setup();
	expect(screen.getByTestId('hero-chart-toggle-hour').textContent).toBe('By hour');
	expect(screen.getByTestId('existing-chart').textContent).toBe('hour');
	fireEvent.click(screen.getByTestId('hero-chart-toggle-run'));
	expect(screen.getByTestId('existing-chart').textContent).toBe('run');
	expect(screen.getByTestId('hero-chart-toggle-run').getAttribute('aria-checked')).toBe('true');
	fireEvent.click(screen.getByTestId('hero-chip-status'));
	fireEvent.click(screen.getByTestId('hero-status-all'));
	expect(screen.getByTestId('existing-chart').textContent).toBe('run');
	fireEvent.click(screen.getByTestId('hero-chart-toggle-hour'));
	expect(screen.getByTestId('existing-chart').textContent).toBe('hour');
});
it('labels the week chart By day', () => {
	setup({ week: true });
	expect(screen.getByTestId('hero-chart-toggle-hour').textContent).toBe('By day');
	expect(screen.getByTestId('hero-chart-toggle-run').textContent).toBe('Running total');
});
it('keeps the primary chart while comparison is pending then supplies the comparison', async () => {
	const source = new Subject<{ hits: { record: { uuid: string; payload: ReportOrder } }[] }>();
	setup({ comparison: new ObservableResource(source) as unknown as ReturnType<typeof resource> });
	expect(screen.getByTestId('existing-chart').getAttribute('data-comparison')).toBe('unavailable');
	await act(async () => {
		source.next({ hits: previous.map((payload) => ({ record: { uuid: payload.uuid, payload } })) });
	});
	expect(screen.getByTestId('existing-chart').getAttribute('data-comparison')).toBe('2');
});

it('keeps the primary chart and figures when the comparison fails', async () => {
	const source = new Subject<{ hits: never[] }>();
	const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
	try {
		setup({
			comparison: new ObservableResource(source) as unknown as ReturnType<typeof resource>,
			probe: false,
		});
		await act(async () => {
			source.error(new Error('comparison failed'));
		});
		expect(screen.getByTestId('existing-chart').getAttribute('data-comparison')).toBe(
			'unavailable'
		);
		expect(screen.getByTestId('hero-total').textContent).toBe('£30.00');
		expect(screen.getByTestId('hero-delta').textContent).toBe('—');
	} finally {
		errors.mockRestore();
	}
});
