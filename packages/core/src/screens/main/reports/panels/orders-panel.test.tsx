/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, screen, waitFor } from '@testing-library/react';

import { mockCredentials, mockState, setOrders } from '../cards/test-utils';
import { preparePanel, room } from './test-utils';
import { saveOrShareCsv } from '../closures/save-or-share-csv';

import type { ReportOrder } from '../context';

beforeEach(() => {
	preparePanel();
	mockState.screenSize = 'lg';
	mockState.from = mockState.to = '2026-07-15';
	mockCredentials.next([{ id: 7, display_name: 'Sam' }]);
	setOrders([
		{
			uuid: 'old',
			number: '41',
			status: 'completed',
			total: '10',
			date_created_gmt: '2026-07-15T10:00:00',
			payment_method: 'cash',
			payment_method_title: 'Cash',
			meta_data: [{ key: '_pos_user', value: '7' }],
		},
		{
			uuid: 'new',
			number: '42',
			status: 'processing',
			total: '20',
			date_created_gmt: '2026-07-15T11:00:00',
			needs_payment: true,
		},
		{
			uuid: 'hidden',
			number: '43',
			status: 'pending',
			total: '30',
			date_created_gmt: '2026-07-15T12:00:00',
		},
	] as ReportOrder[]);
});
afterEach(() => jest.restoreAllMocks());
function open() {
	room();
	fireEvent.click(screen.getByTestId('card-orders-open'));
}
const counted = () => screen.getByTestId('detail-panel-footer').textContent;
// Wrong status scope, sorting, exclusion inversion or clobbering hidden selections fails these.
it('lists the included orders newest first with the counted footer', () => {
	open();
	expect(screen.getAllByTestId(/^orders-panel-row-/).map((row) => row.dataset.testid)).toEqual([
		'orders-panel-row-new',
		'orders-panel-row-old',
	]);
	expect(counted()).toContain('2 of 2 counted');
	expect(screen.getByTestId('orders-panel-row-old').textContent).toContain('10:00 · Sam');
	expect(screen.getByTestId('orders-panel-row-new').textContent).toContain('UNPAID');
});
it('unticking a row removes it from the count and dims it, and keeps it listed', async () => {
	open();
	fireEvent.click(screen.getByTestId('orders-panel-tick-new'));
	expect(counted()).toContain('1 of 2 counted · the numbers follow');
	expect(screen.getAllByTestId(/^orders-panel-row-/)).toHaveLength(2);
	expect(screen.getByTestId('orders-panel-tick-new').getAttribute('aria-checked')).toBe('false');
	expect(screen.getByTestId('orders-panel-row-new').className).toContain('opacity-50');
	expect(screen.getByTestId('orders-panel-tick-all').getAttribute('aria-checked')).toBe('mixed');
	fireEvent.click(screen.getByTestId('detail-panel-export'));
	await waitFor(() =>
		expect(saveOrShareCsv).toHaveBeenCalledWith(
			expect.stringContaining('"#42","11:00","Unknown","UNPAID","£20.00","no"'),
			expect.any(String)
		)
	);
});
it('tick-all clears the exclusions and tick-none adds them', () => {
	open();
	fireEvent.click(screen.getByTestId('orders-panel-tick-all'));
	expect(counted()).toContain('0 of 2 counted');
	expect(screen.getByTestId('orders-panel-tick-all').getAttribute('aria-checked')).toBe('false');
	expect(JSON.parse(screen.getByTestId('excluded').textContent!)).toEqual({
		old: true,
		new: true,
		hidden: true,
	});
	fireEvent.click(screen.getByTestId('orders-panel-tick-all'));
	expect(counted()).toContain('2 of 2 counted');
	expect(JSON.parse(screen.getByTestId('excluded').textContent!)).toEqual({ hidden: true });
});
it('an untick on an order the status set hides is kept when the set widens again', () => {
	open();
	fireEvent.click(screen.getByTestId('orders-panel-tick-new'));
	fireEvent.click(screen.getByTestId('orders-panel-tick-all'));
	fireEvent.click(screen.getByTestId('widen'));
	expect(screen.getByTestId('orders-panel-tick-hidden').getAttribute('aria-checked')).toBe('false');
	expect(counted()).toContain('2 of 3 counted');
});
it('beyond sixty rows says and n more', () => {
	setOrders(
		Array.from({ length: 62 }, (_, i) => ({
			uuid: String(i),
			number: String(i),
			status: 'completed',
			total: '1',
		})) as ReportOrder[]
	);
	open();
	expect(screen.getAllByTestId(/^orders-panel-row-/)).toHaveLength(60);
	expect(screen.getByTestId('orders-list').textContent).toContain('and 2 more');
	expect(counted()).toContain('62 of 62 counted');
});

jest.mock('react-native', () => ({
	...jest.requireActual('react-native'),
	View: React.forwardRef<
		HTMLDivElement,
		React.PropsWithChildren<{ testID?: string; className?: string; style?: React.CSSProperties }>
	>(function View({ children, testID, className, style }, ref) {
		return (
			<div ref={ref} data-testid={testID} className={className} style={style}>
				{children}
			</div>
		);
	}),
}));
