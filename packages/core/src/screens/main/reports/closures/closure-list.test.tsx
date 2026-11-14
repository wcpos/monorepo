/** @jest-environment jsdom */
import * as React from 'react';

import { of } from 'rxjs';
import { fireEvent, render, screen, within } from '@testing-library/react';

import type { ClosureRow } from '@wcpos/database';

import { useStoreDay } from '../../../../hooks/use-store-day';
import { closureResult } from '../../../../services/register-session/closure-result';
import { deriveSettled } from '../../../../services/register-session/settled-figures';
import { ClosureList } from './closure-list';
import { selectClosureRows } from './use-closure-rows';

// Plain tabs never render the optional phone Select or its native overlay.
jest.mock('@wcpos/components/select', () => ({ OptionSelect: () => null }));
jest.mock('uniwind', () => ({
	withUniwind: (component: unknown) => component,
	useCSSVariable: () => [],
}));
jest.mock('@wcpos/query/user-db', () => ({
	...jest.requireActual('@wcpos/query/user-db'),
	observeCredentialStores: (credentials: { populate$: (key: string) => unknown }) =>
		credentials.populate$('stores'),
}));
let mockPhone = false;
jest.mock('@wcpos/components/lib/device', () => ({
	...jest.requireActual('@wcpos/components/lib/device'),
	useIsPhone: () => mockPhone,
}));
// Keep the real Badge and AmountFigure; jsdom's RN View otherwise drops their className.
jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	View: ({
		testID,
		className,
		children,
		style,
	}: React.ComponentProps<typeof import('react-native').View>) => (
		<div data-testid={testID} className={className} style={style as React.CSSProperties}>
			{children}
		</div>
	),
}));
jest.mock('@wcpos/components/text', () => ({
	Text: ({
		testID,
		className,
		children,
	}: {
		testID?: string;
		className?: string;
		children: React.ReactNode;
	}) => (
		<span data-testid={testID} className={className}>
			{children}
		</span>
	),
	TextClassContext: React.createContext(undefined),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));

jest.mock('../../../../services/register/use-register-names', () => ({
	useRegisterNames: () => ({ r: 'Front' }),
}));
let storeTimezone = 'America/Los_Angeles';
const mockSession = {
	get store() {
		return {
			id: 1,
			timezone: storeTimezone,
			currency: 'GBP',
			currency_pos: 'left',
			price_num_decimals: 2,
			price_decimal_sep: '.',
			price_thousand_sep: ',',
		};
	},
	site: {},
	wpCredentials: {
		populate$: () =>
			of([
				{
					id: 2,
					timezone: 'Pacific/Kiritimati',
					currency: 'EUR',
					currency_pos: 'right_space',
					price_num_decimals: 3,
					price_decimal_sep: ',',
					price_thousand_sep: '.',
				},
			]),
	},
};
jest.mock('../../../../contexts/app-state', () => ({
	useAppState: () => mockSession,
}));
jest.mock('../../hooks/use-rest-http-client', () => ({ useRestHttpClient: jest.fn() }));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: jest.fn(),
}));
jest.mock('../../../../hooks/use-app-info', () => ({ useAppInfo: jest.fn() }));
jest.mock('@wcpos/hooks/use-online-status', () => ({ useOnlineStatus: jest.fn() }));
jest.mock('@wcpos/query', () => ({
	useDocField: <T,>(source: T, select: (v: T) => unknown) => (source ? select(source) : undefined),
}));

function row(id: string, changes: Partial<ClosureRow> = {}): ClosureRow {
	return {
		id,
		session_id: id,
		register_id: 'r',
		store_id: 1,
		number: Number(id),
		opened_at: '2026-09-15T10:00:00Z',
		closed_at: '2026-09-17T01:00:00Z',
		till_expected: { cash: '10' },
		expected: { cash: '10' },
		counted: { cash: '8' },
		variance: { cash: '-2' },
		period_sales_total: '0',
		period_refunds_total: '0',
		perpetual_sales_total: '0',
		perpetual_refunds_total: '0',
		unsynced_count: 0,
		unsynced_total: '0',
		software_version: '',
		breakdowns: { closed_by_name: 'Pat' },
		order_ids: [],
		movement_ids: [],
		sync_status: 'synced',
		sync_attempts: 0,
		print_count: 0,
		...changes,
	};
}
beforeEach(() => {
	mockPhone = false;
	storeTimezone = 'America/Los_Angeles';
	jest.useFakeTimers().setSystemTime(new Date('2026-10-01T12:00:00Z'));
});
afterEach(() => jest.useRealTimers());
const scope = { from: '2026-09-15', to: '2026-09-17', registerId: 'r', storeId: 1 };
// Revert: group/sort on closed_at instead of the persisted business_day (or use UTC fallback).
it('groups stamped opening days newest first, falling back to the store day for legacy rows', () => {
	const rows = selectClosureRows(
		[
			row('1', { business_day: '2026-09-15' }),
			row('2'),
			row('3', { business_day: '2026-09-16', closed_at: '2026-09-17T02:00:00Z' }),
			row('4', { business_day: '2026-09-14' }),
			row('5', { register_id: 'other' }),
			row('6', { store_id: 2 }),
		],
		scope,
		'America/Los_Angeles'
	);
	render(<ClosureList rows={rows} />);
	expect(
		screen.getAllByTestId(/^closure-day-/).map((n) => n.firstElementChild?.textContent)
	).toEqual(['Wednesday, 16 Sep 2026', 'Tuesday, 15 Sep 2026']);
	expect(screen.getAllByTestId(/^closure-row-/).map((n) => n.getAttribute('data-testid'))).toEqual([
		'closure-row-3',
		'closure-row-1',
		'closure-row-2',
	]);
});
// Revert: choose Corrected before outstanding named rows; treat the at-close count as current.
it('shows only Unsynced before Corrected, and puts the drawer result last', () => {
	render(
		<ClosureList
			rows={[
				row('1', { business_day: '2026-09-17', corrections_count: 2, synced_rows_at: null }),
				row('2', {
					business_day: '2026-09-17',
					corrections_count: 1,
					synced_rows_at: '2026-09-17',
					unsynced_count: 8,
					variance: { cash: '3' },
				}),
				row('3', {
					business_day: '2026-09-17',
					synced_rows_at: '2026-09-17',
					variance: { cash: '0' },
				}),
			]}
		/>
	);
	expect(
		within(screen.getByTestId('closure-row-1')).getByTestId('closure-badge-1').textContent
	).toBe('Unsynced');
	expect(screen.getByTestId('closure-badge-2').textContent).toBe('Corrected');
	expect(screen.queryByTestId('closure-badge-3')).toBeNull();
	for (const [id, text, difference] of [
		['1', 'Short', '−£2.00'],
		['2', 'Over', '+£3.00'],
		['3', 'Exact', '£0.00'],
	]) {
		const r = screen.getByTestId(`closure-row-${id}`);
		expect(screen.getByTestId(`closure-result-${id}`).textContent).toBe(text);
		expect(screen.getByTestId(`closure-difference-${id}`).textContent).toBe(difference);
		expect(screen.getByTestId(`closure-expected-${id}`).textContent).toBe('£10.00');
		expect(screen.getByTestId(`closure-counted-${id}`).textContent).toBe('£8.00');
		expect(r.querySelector('[data-icon="chevronRight"]')).toBeTruthy();
	}
	expect(screen.getByTestId('closure-row-1').textContent).toContain('£8.00');
	expect(screen.getByTestId('closure-day-2026-09-17').textContent).toContain(
		'£24.00 counted · £1.00 over'
	);
});
// Pins the figure each list surface shows for a closure with no corrections: the RECORDED
// (written) variance, not counted less expected (Exact here).
it.each([
	['row', 'closure-result-1', 'Short'],
	['day heading', 'closure-day-2026-09-17', '£10.00 counted · £2.00 short'],
	['stats', 'closure-stat-discrepancy', '−£2.00'],
])('the %s shows the RECORDED result', (_, testID, text) => {
	const recorded = {
		business_day: '2026-09-17',
		counted: { cash: '10' },
		variance: { cash: '-2' },
	};
	render(<ClosureList rows={[row('1', recorded)]} />);
	expect(screen.getByTestId(testID).textContent).toContain(text);
});
// A recount took the drawer from £8 to £11 counted. Paul 2026-11-09: settled everywhere, the
// Corrected badge kept; the detail's result is closureResult({ settled }), £1.00 over.
it.each([
	['row', 'closure-result-1', 'Over'],
	['row counted', 'closure-counted-1', '£11.00'],
	['row badge', 'closure-badge-1', 'Corrected'],
	['day heading', 'closure-day-2026-09-17', '£11.00 counted · £1.00 over'],
	['stats', 'closure-stat-discrepancy', '£1.00'],
])('the %s of a recounted closure shows the SETTLED result the detail shows', (_, testID, text) => {
	const recount = {
		id: 1,
		type: 'recount' as const,
		created_at: '2026-09-17T02:00:00Z',
		actor: { id: 1, name: 'Sam' },
		approver: null,
		reason: 'Miscount',
		figures: { counted: { cash: '11' } },
	};
	const corrected = row('1', {
		business_day: '2026-09-17',
		synced_rows_at: 'now',
		corrections_count: 1,
		corrections: [recount],
	} as Partial<ClosureRow>);
	expect(closureResult({ settled: deriveSettled(corrected, [recount]).settled }, 4)).toMatchObject({
		minor: 10000,
		kind: 'over',
	});
	render(<ClosureList rows={[corrected]} />);
	expect(screen.getByTestId(testID).textContent).toContain(text);
});
// Revert: filter on the opener/any sale cashier instead of the recorded closer.
it('filters by the closer', () => {
	const rows = [row('1', { closed_by: 7 }), row('2', { closed_by: 8 })];
	expect(selectClosureRows(rows, { ...scope, cashier: 7 }, 'UTC').map((r) => r.id)).toEqual(['1']);
});

// Revert: leave rows inert instead of opening the selected document.
it('opens the tapped closure', () => {
	const onSelect = jest.fn();
	const record = row('1');
	render(<ClosureList rows={[record]} onSelect={onSelect} />);
	fireEvent.click(screen.getByTestId('closure-row-1'));
	expect(onSelect).toHaveBeenCalledWith(record);
});

// Revert: compare with the device/UTC day instead of the store's current calendar day.
it('labels Today and Yesterday in store time', () => {
	jest.useFakeTimers().setSystemTime(new Date('2026-09-17T01:00:00Z'));
	render(
		<ClosureList
			rows={[row('1', { business_day: '2026-09-16' }), row('2', { business_day: '2026-09-15' })]}
		/>
	);
	expect(screen.getByTestId('closure-day-2026-09-16').firstElementChild?.textContent).toBe('Today');
	expect(screen.getByTestId('closure-day-2026-09-15').firstElementChild?.textContent).toBe(
		'Yesterday'
	);
	jest.useRealTimers();
});

// Revert: make remote offline rows disappear or remain interactive without unavailable marking.
it('dims and disables unavailable remote rows while retaining their figures', () => {
	const select = jest.fn();
	render(<ClosureList rows={[row('1')]} onSelect={select} unavailableIds={new Set(['1'])} />);
	expect(screen.getByTestId('closure-unavailable-1').textContent).toBe('Unavailable offline');
	expect(screen.getByTestId('closure-counted-1').textContent).toContain('8.00');
	fireEvent.click(screen.getByTestId('closure-row-1'));
	expect(select).not.toHaveBeenCalled();
});

// Revert: regroup by closing timestamp/current timezone instead of the stamped opening business day.
it('keeps overnight closures on their stamped days across DST and a later store timezone edit', () => {
	const base: ClosureRow = require('../../../../services/register-session/__fixtures__/closure-local-row.json');
	const fixture = require('../../../../services/register-session/__fixtures__/corrections-dst.json');
	jest.setSystemTime(new Date(fixture.now));
	// Exercise the real hook's store-zone resolution with a mutable store record.
	storeTimezone = fixture.timezone;
	const source = fixture.closures.map((record: Partial<ClosureRow>) => ({ ...base, ...record }));
	const scope = { from: '2026-10-31', to: '2026-11-01', registerId: base.register_id, storeId: 1 };
	function List() {
		const day = useStoreDay();
		return <ClosureList rows={selectClosureRows(source, scope, day.timezone)} />;
	}
	const before = JSON.stringify(source);
	const settled = deriveSettled(source[0], fixture.corrections);
	expect(settled.settled).toMatchObject(fixture.settled);
	const view = render(<List />);
	const groups = () =>
		screen.getAllByTestId(/^closure-day-/).map((node) => node.getAttribute('data-testid'));
	expect(groups()).toEqual(['closure-day-2026-11-01', 'closure-day-2026-10-31']);
	expect(screen.getByTestId('closure-day-2026-11-01').firstElementChild?.textContent).toBe('Today');
	expect(screen.getByTestId('closure-day-2026-10-31').firstElementChild?.textContent).toBe(
		'Yesterday'
	);
	// Both closed at 01:30 local, on opposite sides of the repeated hour.
	for (const id of ['before-fallback', 'after-fallback'])
		expect(screen.getByTestId(`closure-row-${id}`).textContent).toContain('01:30');
	storeTimezone = 'Asia/Tokyo';
	view.rerender(<List />);
	expect(groups()).toEqual(['closure-day-2026-11-01', 'closure-day-2026-10-31']);
	expect(screen.getByTestId('closure-counted-before-fallback').textContent).toContain('178.00');
	expect(JSON.stringify(source)).toBe(before);
});

// Revert: omit semantic money colours or colour exact as a discrepancy.
it('distinguishes short, over and exact drawer results with semantic tokens', () => {
	render(
		<ClosureList
			rows={[
				row('1'),
				row('2', { variance: { cash: '3' } }),
				row('3', { variance: { cash: '0' } }),
			]}
		/>
	);
	for (const [id, token, badgeTone] of [
		['1', 'text-bad', 'bg-bad/15'],
		['2', 'text-ok', 'bg-ok/15'],
		['3', 'text-muted-foreground', 'bg-muted'],
	]) {
		expect(screen.getByTestId(`closure-result-${id}`).className).toContain(badgeTone);
		expect(screen.getByTestId(`closure-difference-${id}`).className).toContain(token);
		expect(screen.getByTestId(`closure-difference-${id}`).className).toContain('tabular-nums');
	}
});

// Revert: derive a legacy closure's day from closing time rather than opening time.
it('keeps a legacy overnight closure on its opening store day', () => {
	expect(
		selectClosureRows(
			[row('legacy', { opened_at: '2026-09-16T02:00:00Z' })],
			scope,
			'America/Los_Angeles'
		)[0].business_day
	).toBe('2026-09-15');
});

// Revert: format selected-store headings and times in the bound timezone.
it('shows remote times and Today using the selected store timezone', () => {
	jest.setSystemTime(new Date('2026-09-17T12:00:00Z'));
	render(
		<ClosureList
			rows={[
				row('remote', {
					business_day: '2026-09-18',
					opened_at: '2026-09-17T12:00:00Z',
					closed_at: '2026-09-17T13:00:00Z',
				}),
			]}
			{...{ storeId: 2 }}
		/>
	);
	expect(screen.getByTestId('closure-day-2026-09-18').firstElementChild?.textContent).toBe('Today');
	expect(screen.getByTestId('closure-row-remote').textContent).toContain('02:00 → 03:00');
});

// Revert: keep useCurrencyFormat bound to the till instead of the viewed store settings.
it('formats counted and variance using the viewed currency, precision and separators', () => {
	render(
		<ClosureList
			storeId={2}
			rows={[row('euro', { counted: { cash: '1234.567' }, variance: { cash: '-2.345' } })]}
		/>
	);
	expect(screen.getByTestId('closure-counted-euro').textContent).toBe('1.234,567 €');
	expect(screen.getByTestId('closure-expected-euro').textContent).toBe('10,000 €');
	expect(screen.getByTestId('closure-difference-euro').textContent).toBe('−2,345 €');
	expect(screen.getByTestId('closure-result-euro').textContent).toBe('Short');
});
// Revert: check unavailableIds using row.id instead of server_closure_id.
it('disables a server-identified unavailable row', () => {
	const select = jest.fn();
	render(
		<ClosureList
			rows={[row('local', { server_closure_id: 'server' })]}
			unavailableIds={new Set(['server'])}
			onSelect={select}
		/>
	);
	fireEvent.click(screen.getByTestId('closure-row-local'));
	expect(select).not.toHaveBeenCalled();
	expect(screen.getByTestId('closure-unavailable-local')).toBeTruthy();
});

// The shared formatter must preserve the closure list's headings and time-only range.
it('preserves Today, Yesterday and past headings with time-only rows', () => {
	jest.setSystemTime(new Date('2026-09-17T01:00:00Z'));
	render(
		<ClosureList
			rows={[
				row('1', { business_day: '2026-09-16' }),
				row('2', { business_day: '2026-09-15' }),
				row('3', { business_day: '2026-09-12' }),
			]}
		/>
	);
	expect(screen.getByTestId('closure-day-2026-09-16').firstElementChild?.textContent).toBe('Today');
	expect(screen.getByTestId('closure-day-2026-09-15').firstElementChild?.textContent).toBe(
		'Yesterday'
	);
	expect(screen.getByTestId('closure-day-2026-09-12').firstElementChild?.textContent).toBe(
		'Saturday, 12 Sep 2026'
	);
	expect(screen.getByTestId('closure-row-1').textContent).toContain('03:00 → 18:00');
});

// Revert: filter the totals along with the rows, or drop the mounted session reader.
it('filters All, Open and Closed without changing the scope count', () => {
	const session = { id: 'open', expected_float: '50' } as import('./session-card').SessionSummary;
	render(
		<ClosureList
			rows={[row('1', { business_day: '2026-10-01' })]}
			sessions={[session]}
			sessionRows={<span data-testid="open-row">Open</span>}
		/>
	);
	expect(screen.getByText('2 sessions')).toBeTruthy();
	fireEvent.click(screen.getByTestId('closures-filter-open'));
	expect(screen.queryByTestId('closure-row-1')).toBeNull();
	expect(getComputedStyle(screen.getByTestId('open-row').parentElement!).display).not.toBe('none');
	fireEvent.click(screen.getByTestId('closures-filter-closed'));
	expect(screen.getByTestId('closure-row-1')).toBeTruthy();
	expect(getComputedStyle(screen.getByTestId('open-row').parentElement!).display).toBe('none');
	fireEvent.click(screen.getByTestId('closures-filter-all'));
	expect(getComputedStyle(screen.getByTestId('open-row').parentElement!).display).not.toBe('none');
	expect(screen.getByText('2 sessions')).toBeTruthy();
});

// Revert: include open cash activity, prefer expected over counted float, or sum absolute variances.
it('totals three closures and one open session in the viewed currency, hiding stats when blind', () => {
	const sessions = [
		{
			id: 'open',
			expected_float: '50',
			expected: { cash: '999' },
			register_id: 'r',
			status: 'open',
			sync_status: 'synced',
			sync_attempts: 0,
			opened_at_gmt: '2026-10-01 08:00:00',
		},
	] as import('./session-card').SessionSummary[];
	const rows = [
		row('1', {
			expected: { cash: '120' },
			counted: { cash: '118' },
			variance: { cash: '-2' },
			breakdowns: { opening_float: { counted: '100', expected: '90' } },
		}),
		row('2', {
			expected: { cash: '150' },
			counted: { cash: '153' },
			variance: { cash: '3' },
			breakdowns: { opening_float: { expected: '50' } },
		}),
		row('3', {
			expected: { cash: '80' },
			counted: { cash: '80' },
			variance: { cash: '0' },
			breakdowns: { opening_float: { counted: '0', expected: '20' } },
		}),
	];
	const view = render(<ClosureList rows={rows} sessions={sessions} storeId={2} />);
	for (const [id, value] of [
		['sessions', '4'],
		['cash-at-open', '200,000 €'],
		['cash-activity', '+200,000 €'],
		['cash-at-close', '351,000 €'],
		['discrepancy', '+1,000 €'],
	]) {
		expect(screen.getByTestId(`closure-stat-${id}`).textContent).toBe(value);
	}
	expect(screen.getAllByTestId(/^closure-stat-/)[0].getAttribute('data-testid')).toBe(
		'closure-stat-discrepancy'
	);
	expect(screen.getByTestId('closure-stat-discrepancy').className).toContain('text-2xl');
	expect(screen.getByTestId('closures-head').textContent).toBe(
		'ClosureExpectedCountedDifferenceResult'
	);
	expect(screen.getByText('1 open · 3 closed')).toBeTruthy();
	expect(screen.getByText('1 short · 1 over · 1 exact')).toBeTruthy();
	view.rerender(<ClosureList rows={rows} sessions={sessions} blind storeId={2} />);
	expect(screen.queryByTestId('closure-stat-sessions')).toBeNull();
});

jest.mock('@wcpos/components/icon', () => ({
	Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

// Revert: show a closed total for an open-only day, or replace the quiet Today state with global empty.
it('shows Today with an open row and no closed figures, retaining the empty-scope message', () => {
	const sessions = [{ id: 's', expected_float: '20' }] as import('./session-card').SessionSummary[];
	const view = render(
		<ClosureList
			rows={[]}
			sessions={sessions}
			scopeDay="2026-10-01"
			sessionRows={<span>Open till</span>}
		/>
	);
	expect(screen.getByTestId('closure-day-2026-10-01').textContent).toBe('Today');
	expect(screen.getByText('No closures yet today')).toBeTruthy();
	expect(screen.queryByTestId('closures-empty')).toBeNull();
	expect(screen.getByTestId('closure-stat-cash-at-close').textContent).toBe('—');
	expect(screen.getByTestId('closure-stat-discrepancy').textContent).toBe('—');
	expect(screen.getByTestId('closure-stat-cash-activity').textContent).toBe('+£0.00');
	view.rerender(<ClosureList rows={[]} sessions={[]} scopeDay="2026-10-01" />);
	expect(screen.getByTestId('closures-empty')).toBeTruthy();
});

// Revert: let binary floating-point residue turn a net-exact day into a discrepancy.
it('sums cash at stored precision and omits zero result counts', () => {
	const rows = ['-0.1', '-0.2', '0.3'].map((cash, index) =>
		row(String(index), {
			business_day: '2026-09-17',
			variance: { cash },
		})
	);
	const view = render(<ClosureList rows={rows} />);
	expect(screen.getByTestId('closure-stat-discrepancy').textContent).toBe('—');
	expect(screen.getByTestId('closure-day-2026-09-17').textContent).toContain(
		'£24.00 counted · Exact'
	);
	expect(screen.getByText('2 short · 1 over')).toBeTruthy();
	view.rerender(<ClosureList rows={rows.slice(0, 2)} />);
	expect(screen.getByTestId('closure-stat-discrepancy').textContent).toBe('−£0.30');
	expect(screen.getByTestId('closure-stat-discrepancy').className).toContain('text-bad');
	expect(screen.getByText('2 short')).toBeTruthy();
});

// Carried wins over Corrected, but never hides outstanding accounting.
it('badges carried closures by destination, after Unsynced and before Corrected', () => {
	render(
		<ClosureList
			rows={[
				row('1', { reason: 'store_switch', corrections_count: 1, synced_rows_at: null }),
				row('2', {
					reason: 'store_switch',
					corrections_count: 1,
					synced_rows_at: 'now',
					breakdowns: { labels: { carried_to_store_name: 'Market' } },
				}),
				row('3', { reason: 'store_switch', synced_rows_at: 'now' }),
				row('4', { reason: 'end_of_day', synced_rows_at: 'now' }),
			]}
		/>
	);
	expect(screen.getByTestId('closure-badge-1').textContent).toBe('Unsynced');
	expect(screen.getByTestId('closure-badge-2').textContent).toBe('Carried to Market');
	expect(screen.getByTestId('closure-badge-3').textContent).toBe('Carried');
	expect(screen.queryByTestId('closure-badge-4')).toBeNull();
});

// Revert: keep tablet columns on phones instead of labelling their figures in the row body.
it('labels phone figures and keeps the result beside the status badge', () => {
	mockPhone = true;
	render(<ClosureList rows={[row('1')]} />);
	expect(screen.getByTestId('closure-figures-1').textContent).toBe(
		'Expected £10.00 · Counted £8.00 · Difference −£2.00'
	);
	expect(screen.queryByTestId('closure-expected-1')).toBeNull();
	expect(screen.queryByTestId('closures-head')).toBeNull();
	const result = screen.getByTestId('closure-result-1');
	expect(result.textContent).toBe('Short');
	expect(result.className).toContain('bg-bad/15');
	expect(result.parentElement).toBe(screen.getByTestId('closure-badge-1').parentElement);
	expect(screen.getAllByTestId(/^closure-stat-/)[0].getAttribute('data-testid')).toBe(
		'closure-stat-discrepancy'
	);
});
