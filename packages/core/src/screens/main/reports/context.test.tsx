/**
 * @jest-environment jsdom
 */
import * as React from 'react';

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { of } from 'rxjs';

import {
	ReportsComparison,
	ReportsProvider,
	ReportsRefunds,
	ReportsScopeProvider,
	useReportsData,
	useReportsHandles,
	useReportsPeriod,
	useReportsScope,
	useReportsSelection,
} from './context';
import { QueryStateProvider, useQueryStateActions } from '../../../query';

import type { QueryHandle } from '../../../query';

const { fakeQueryHandle } = jest.requireActual('@wcpos/core-test/fake-query-handle');

let mockZone = 'UTC';
let mockLocalParents: { uuid?: string }[] = [];
const mockRuntime = { engine: {}, locale: 'en' };
// The provider reads the viewed store's precision through useDocField; the app-state mock's
// store is a plain object, so the field is read directly.
jest.mock('@wcpos/query', () => ({
	...jest.requireActual('@wcpos/query'),
	useQueryRuntime: () => mockRuntime,
	observeEngineQuery: () =>
		of({ hits: mockLocalParents.map((payload) => ({ record: { uuid: payload.uuid, payload } })) }),
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
/** A handle answered with these hits (`ready: false` for a read that has not answered). */
function handleOf(hits: object[], ready = true): QueryHandle & { set: (partial: object) => void } {
	return fakeQueryHandle({ ready, result: { hits } });
}
const handle = handleOf(
	orders.map((document) => ({
		id: document.uuid,
		document,
		record: {
			uuid: document.uuid,
			payload: {
				total: `engine-${document.uuid}`,
				status: document.uuid === 'one' ? 'completed' : 'processing',
			},
		},
	}))
);

function Provider({
	handle,
	comparisonHandle = handle,
	refundsHandle = handleOf([]),
	children,
}: React.PropsWithChildren<{
	handle: QueryHandle;
	comparisonHandle?: QueryHandle;
	refundsHandle?: QueryHandle;
}>) {
	return (
		<ReportsScopeProvider>
			<ReportsProvider
				handle={handle}
				comparisonHandle={comparisonHandle}
				refundsHandle={refundsHandle}
			>
				{children}
			</ReportsProvider>
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

describe('ReportsProvider handles context', () => {
	it('maps report rows from engine record payloads rather than legacy documents', () => {
		render(
			<QueryStateProvider
				collection="orders"
				initialPageSize={Number.MAX_SAFE_INTEGER}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			>
				<React.Suspense fallback={null}>
					<Provider handle={handle}>
						<PayloadProbe />
					</Provider>
				</React.Suspense>
			</QueryStateProvider>
		);

		expect(screen.getByTestId('order-totals').textContent).toBe('engine-one,engine-two');
	});

	it('derives orders, selection, and dates from the handle result plus query state', () => {
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
					<Provider handle={handle}>
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
	 * `ReportsSyncProgress` reads nothing but the handles, and they do not change when
	 * the cashier ticks a row — but the whole bundle used to be republished together, so it
	 * re-rendered on every selection change and every order emission.
	 *
	 * The consumer is memoised with no props, so a parent render alone cannot reach it.
	 */
	it('does not re-render a handles-only consumer when the row selection changes', () => {
		const onHandlesRender = jest.fn();
		const HandlesConsumer = React.memo(function HandlesConsumer() {
			useReportsHandles();
			onHandlesRender();
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
					<Provider handle={handle}>
						<HandlesConsumer />
						<SelectionButton />
					</Provider>
				</React.Suspense>
			</QueryStateProvider>
		);

		const rendersBefore = onHandlesRender.mock.calls.length;
		expect(rendersBefore).toBeGreaterThan(0);

		fireEvent.click(screen.getByTestId('exclude'));

		expect(onHandlesRender).toHaveBeenCalledTimes(rendersBefore);
	});
});

// The three readers go through `useQuerySnapshot`: an unanswered handle suspends its reader,
// a failed one throws to the boundary. Reading `handle.value` directly renders an empty report
// as if the day had no sales.
describe('the readers suspend on unanswered handles', () => {
	const hits = (...ids: string[]) =>
		ids.map((uuid) => ({ record: { uuid, payload: { status: 'completed', total: '10' } } }));
	function Orders() {
		const { allOrders, comparisonOrders, periodRefunds } = useReportsData();
		return (
			<span data-testid="readers">
				{allOrders.map((order) => order.uuid).join(',')}|{comparisonOrders.length}|
				{periodRefunds === undefined ? 'none' : periodRefunds.length}
			</span>
		);
	}
	function Room({
		handle,
		comparisonHandle,
		refundsHandle,
	}: {
		handle: QueryHandle;
		comparisonHandle: QueryHandle;
		refundsHandle: QueryHandle;
	}) {
		return (
			<QueryStateProvider
				collection="orders"
				initialPageSize={Number.MAX_SAFE_INTEGER}
				initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			>
				<React.Suspense fallback={<span data-testid="provider-loading" />}>
					<Provider
						handle={handle}
						comparisonHandle={comparisonHandle}
						refundsHandle={refundsHandle}
					>
						<Orders />
						<React.Suspense fallback={<span data-testid="comparison-loading" />}>
							<ReportsComparison>
								<span data-testid="comparison-read" />
							</ReportsComparison>
						</React.Suspense>
						<React.Suspense fallback={<span data-testid="refunds-loading" />}>
							<ReportsRefunds>
								<span data-testid="refunds-read" />
							</ReportsRefunds>
						</React.Suspense>
					</Provider>
				</React.Suspense>
			</QueryStateProvider>
		);
	}

	it('the provider suspends until the sales handle answers, then renders its rows', async () => {
		const sales = handleOf([], false);
		render(<Room handle={sales} comparisonHandle={handleOf([])} refundsHandle={handleOf([])} />);
		expect(screen.getByTestId('provider-loading')).toBeTruthy();
		expect(screen.queryByTestId('readers')).toBeNull();

		await act(async () => sales.set({ ready: true, result: { hits: hits('one', 'two') } }));
		expect(screen.queryByTestId('provider-loading')).toBeNull();
		expect(screen.getByTestId('readers').textContent).toBe('one,two|0|none');
	});

	// A date or filter change is a new handle: the previous figures stay until it answers,
	// rather than blanking the report to its loading shell.
	it('keeps the previous orders while a changed sales handle answers', async () => {
		const comparison = handleOf([]);
		const refunds = handleOf([]);
		const view = render(
			<Room handle={handleOf(hits('one'))} comparisonHandle={comparison} refundsHandle={refunds} />
		);
		expect(screen.getByTestId('readers').textContent).toBe('one|0|none');

		const next = handleOf([], false);
		await act(async () => {
			view.rerender(<Room handle={next} comparisonHandle={comparison} refundsHandle={refunds} />);
		});
		expect(screen.queryByTestId('provider-loading')).toBeNull();
		expect(screen.getByTestId('readers').textContent).toBe('one|0|none');

		await act(async () => next.set({ ready: true, result: { hits: hits('two', 'three') } }));
		expect(screen.getByTestId('readers').textContent).toBe('two,three|0|none');
	});

	it('the comparison and refunds readers suspend in their own boundaries', async () => {
		const comparison = handleOf([], false);
		const refunds = handleOf([], false);
		render(
			<Room handle={handleOf(hits('one'))} comparisonHandle={comparison} refundsHandle={refunds} />
		);
		// The current figure is drawn; only the two secondary reads wait.
		expect(screen.getByTestId('readers').textContent).toBe('one|0|none');
		expect(screen.getByTestId('comparison-loading')).toBeTruthy();
		expect(screen.getByTestId('refunds-loading')).toBeTruthy();

		await act(async () => comparison.set({ ready: true, result: { hits: hits('old') } }));
		expect(screen.getByTestId('comparison-read')).toBeTruthy();
		expect(screen.getByTestId('refunds-loading')).toBeTruthy();

		await act(async () => refunds.set({ ready: true, result: { hits: [] } }));
		expect(screen.getByTestId('refunds-read')).toBeTruthy();
	});

	it('throws a failed sales read to the nearest boundary', () => {
		const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
		class Boundary extends React.Component<React.PropsWithChildren, { error: unknown }> {
			state = { error: null as unknown };
			static getDerivedStateFromError(error: unknown) {
				return { error };
			}
			render() {
				return this.state.error ? (
					<span data-testid="failed">{String((this.state.error as Error).message)}</span>
				) : (
					this.props.children
				);
			}
		}
		try {
			const sales = fakeQueryHandle({ ready: false, error: new Error('sales failed') });
			render(
				<Boundary>
					<Room handle={sales} comparisonHandle={handleOf([])} refundsHandle={handleOf([])} />
				</Boundary>
			);
			expect(screen.getByTestId('failed').textContent).toBe('sales failed');
		} finally {
			errors.mockRestore();
		}
	});
});

// Removing the device status set would include pending/cancelled orders in the default figure.
it('counts completed and processing, never pending or cancelled by default', () => {
	const statusHandle = handleOf(
		[
			'completed',
			'processing',
			'pending',
			'on-hold',
			'cancelled',
			'refunded',
			'failed',
			'draft',
		].map((status) => ({ record: { uuid: status, payload: { status, total: '10' } } }))
	);
	render(
		<QueryStateProvider
			collection="orders"
			initialPageSize={Number.MAX_SAFE_INTEGER}
			initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
		>
			<React.Suspense fallback={null}>
				<Provider handle={statusHandle}>
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

// Writing detail into query state or retaining it across provider visits breaks this contract.
it('detail is device state, initially null', () => {
	function DetailProbe() {
		const { detail, setDetail } = useReportsScope();
		return (
			<button data-testid="detail" onClick={() => setDetail('taxes')}>
				{String(detail)}
			</button>
		);
	}
	const view = render(
		<ReportsScopeProvider>
			<DetailProbe />
		</ReportsScopeProvider>
	);
	expect(screen.getByTestId('detail').textContent).toBe('null');
	fireEvent.click(screen.getByTestId('detail'));
	expect(screen.getByTestId('detail').textContent).toBe('taxes');
	view.unmount();
	render(
		<ReportsScopeProvider>
			<DetailProbe />
		</ReportsScopeProvider>
	);
	expect(screen.getByTestId('detail').textContent).toBe('null');
});

// Parent scope wins over a refund's metadata; absent parents require matching POS identity.
function refundRoom(
	parents: { uuid?: string; [key: string]: unknown }[],
	refunds: object[],
	store = '9',
	options: {
		register?: string | null;
		cashier?: number;
		orders?: { uuid: string; [key: string]: unknown }[];
	} = {}
) {
	mockLocalParents = parents;
	const source = handleOf(refunds.map((payload) => ({ record: { payload } })));
	const sales = handleOf(
		(options.orders ?? []).map((payload) => ({ record: { uuid: payload.uuid, payload } }))
	);
	function RefundProbe() {
		const { periodRefunds } = useReportsData();
		return (
			<span data-testid="period-refunds">
				{periodRefunds?.map((row) => row.id).join(',') ?? 'loading'}
			</span>
		);
	}
	return render(
		<QueryStateProvider
			collection="orders"
			initialPageSize={100}
			initialSort={{ field: 'date_created_gmt', direction: 'desc' }}
			initialFilters={{
				store,
				register: options.register === null ? undefined : (options.register ?? 'front'),
				cashier: options.cashier,
			}}
		>
			<Provider handle={sales} refundsHandle={source}>
				<React.Suspense fallback={<RefundProbe />}>
					<ReportsRefunds>
						<Probe />
						<RefundProbe />
					</ReportsRefunds>
				</React.Suspense>
			</Provider>
		</QueryStateProvider>
	);
}
const identity = (store: string, register = 'front') => [
	{ key: '_pos_store', value: store },
	{ key: '_wcpos_register', value: register },
];
// Removing the non-POS parent branch loses refunds from sales made before this period.
it('a refund of a local online parent outside the period joins the room when no register is selected', async () => {
	refundRoom(
		[{ id: 4, created_via: 'checkout', date_created_gmt: '2025-01-01', meta_data: identity('10') }],
		[
			{ id: 1, parent_id: 4 },
			{ id: 2, parent_id: 5 },
		],
		'9',
		{ register: null }
	);
	await waitFor(() => expect(screen.getByTestId('period-refunds').textContent).toBe('1'));
});
it('a refund of a local online parent is dropped when a register is selected', async () => {
	refundRoom([{ id: 4, created_via: 'checkout' }], [{ id: 1, parent_id: 4 }]);
	await waitFor(() => expect(screen.getByTestId('period-refunds').textContent).toBe(''));
});
it('a cashier scope excludes a local online parent even without a register', async () => {
	refundRoom([{ id: 4, created_via: 'checkout' }], [{ id: 1, parent_id: 4 }], '9', {
		register: null,
		cashier: 7,
	});
	await waitFor(() => expect(screen.getByTestId('period-refunds').textContent).toBe(''));
});
it('period refunds are scoped to the room by their parent order', async () => {
	refundRoom(
		[
			{ id: 4, meta_data: identity('9') },
			{ id: 5, meta_data: identity('9', 'back') },
		],
		[
			{ id: 1, parent_id: 4 },
			{ id: 2, parent_id: 5 },
		]
	);
	expect(await screen.findByText('1')).toBeTruthy();
});
it('a refund whose parent is not local is kept by its own POS identity', async () => {
	refundRoom(
		[],
		[
			{ id: 1, parent_id: 4, meta_data: identity('9') },
			{ id: 2, parent_id: 5 },
			{ id: 3, parent_id: 6, meta_data: identity('9', 'back') },
		]
	);
	expect(await screen.findByText('1')).toBeTruthy();
});
it("a refund of another store's order is dropped", async () => {
	refundRoom(
		[{ id: 4, meta_data: identity('10') }],
		[
			{ id: 1, parent_id: 4, meta_data: identity('9') },
			{ id: 2, parent_id: 5, meta_data: identity('9') },
		]
	);
	expect(await screen.findByText('2')).toBeTruthy();
});

it('local parents use created_via for the legacy POS store filter', async () => {
	refundRoom(
		[
			{ id: 4, created_via: 'woocommerce-pos', meta_data: identity('0') },
			{ id: 5, created_via: 'checkout', meta_data: identity('0') },
		],
		[
			{ id: 1, parent_id: 4 },
			{ id: 2, parent_id: 5 },
		],
		'woocommerce-pos'
	);
	expect(await screen.findByText('1')).toBeTruthy();
});

// Omitting cashier matching admits both local parents and orphan refunds from other cashiers.
it('applies the cashier filter to period refunds', async () => {
	const cashierIdentity = (cashier: string) => [
		...identity('9'),
		{ key: '_pos_user', value: cashier },
	];
	refundRoom(
		[
			{ id: 4, meta_data: cashierIdentity('7') },
			{ id: 5, meta_data: cashierIdentity('8') },
		],
		[
			{ id: 1, parent_id: 4, meta_data: cashierIdentity('8') },
			{ id: 2, parent_id: 5, meta_data: cashierIdentity('7') },
			{ id: 3, parent_id: 6, meta_data: cashierIdentity('7') },
			{ id: 4, parent_id: 7, meta_data: cashierIdentity('8') },
			{ id: 5, parent_id: 8, meta_data: identity('9') },
		],
		'9',
		{ cashier: 7 }
	);
	await waitFor(() => expect(screen.getByTestId('period-refunds').textContent).toBe('1,3'));
});

// Exclusions must precede both held-order membership and the local-parent fallback.
it.each([true, false])(
	'excludes refunds whose parent was explicitly unticked (held: %s)',
	async (held) => {
		const parent = { id: 4, uuid: 'one', status: 'completed', meta_data: identity('9') };
		refundRoom(
			[parent, { id: 5, uuid: 'earlier', meta_data: identity('9') }],
			[
				{ id: 1, parent_id: 4 },
				{ id: 2, parent_id: 5 },
			],
			'9',
			{ orders: held ? [parent] : [] }
		);
		await waitFor(() => expect(screen.getByTestId('period-refunds').textContent).toBe('1,2'));
		fireEvent.click(screen.getByTestId('exclude-one'));
		expect(screen.getByTestId('period-refunds').textContent).toBe('2');
	}
);

it('normalizes the store-zero sentinel in the refund fallback', async () => {
	refundRoom(
		[],
		[
			{ id: 1, parent_id: 4, meta_data: identity('0') },
			{ id: 2, parent_id: 5, meta_data: identity('9') },
			{ id: 3, parent_id: 6, meta_data: identity('0', 'back') },
			{ id: 4, parent_id: 7 },
		],
		'woocommerce-pos'
	);
	await waitFor(() => expect(screen.getByTestId('period-refunds').textContent).toBe('1'));
});
