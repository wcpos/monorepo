/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, within } from '@testing-library/react';

import type { ClosureRow } from '@wcpos/database';

import { ClosureList } from './closure-list';
import { selectClosureRows } from './use-closure-rows';

jest.mock('@wcpos/components/text', () => ({
	Text: require('react-native').Text,
	TextClassContext: require('react').createContext(undefined),
}));
jest.mock('../../../../contexts/translations', () => ({
	useT: () => jest.requireActual('../../../../../jest/translate').createTestT(),
}));
jest.mock('../../hooks/use-currency-format', () => ({
	useCurrencyFormat: () => ({ format: (n: number) => `£${n.toFixed(2)}` }),
}));
jest.mock('../../../../services/register/use-register-names', () => ({
	useRegisterNames: () => ({ r: 'Front' }),
}));
jest.mock('../../../../hooks/use-store-day', () => ({
	...jest.requireActual('../../../../hooks/use-store-day'),
	useStoreDay: () => ({ timezone: 'America/Los_Angeles' }),
}));
jest.mock('../../../../services/register-session/use-register-session-collections', () => ({
	useClosureCollection: () => undefined,
}));
jest.mock('../../../../contexts/app-state', () => ({ useAppState: () => ({}) }));
jest.mock('../../hooks/use-rest-http-client', () => ({ useRestHttpClient: jest.fn() }));
jest.mock('../../../../services/register/use-register-binding', () => ({
	useRegisterBinding: jest.fn(),
}));
jest.mock('../../../../hooks/use-app-info', () => ({ useAppInfo: jest.fn() }));
jest.mock('@wcpos/hooks/use-online-status', () => ({ useOnlineStatus: jest.fn() }));
jest.mock('@wcpos/query', () => ({ useDocField: () => undefined }));

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
	expect(screen.getAllByTestId(/^closure-day-/).map((n) => n.textContent)).toEqual([
		'Wednesday, 16 Sep 2026',
		'Tuesday, 15 Sep 2026',
	]);
	expect(screen.getAllByTestId(/^closure-row-/).map((n) => n.getAttribute('data-testid'))).toEqual([
		'closure-row-3',
		'closure-row-2',
		'closure-row-1',
	]);
});
// Revert: choose Corrected before outstanding named rows; treat the at-close count as current.
it('shows only Unsynced before Corrected, and puts the drawer result last', () => {
	render(
		<ClosureList
			rows={[
				row('1', { corrections_count: 2, synced_rows_at: null }),
				row('2', {
					corrections_count: 1,
					synced_rows_at: '2026-09-17',
					unsynced_count: 8,
					variance: { cash: '3' },
				}),
				row('3', { synced_rows_at: '2026-09-17', variance: { cash: '0' } }),
			]}
		/>
	);
	expect(
		within(screen.getByTestId('closure-row-1')).getByTestId('closure-badge-1').textContent
	).toBe('Unsynced');
	expect(screen.getByTestId('closure-badge-2').textContent).toBe('Corrected');
	expect(screen.queryByTestId('closure-badge-3')).toBeNull();
	for (const [id, text] of [
		['1', '£2.00 short'],
		['2', '£3.00 over'],
		['3', 'Exact'],
	]) {
		const r = screen.getByTestId(`closure-row-${id}`);
		expect(r.lastElementChild?.textContent).toBe(text);
	}
	expect(screen.getByTestId('closure-row-1').textContent).toContain('£8.00');
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
	expect(screen.getByTestId('closure-day-2026-09-16').textContent).toBe('Today');
	expect(screen.getByTestId('closure-day-2026-09-15').textContent).toBe('Yesterday');
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
