/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';

import { mockState, setOrders } from '../cards/test-utils';
import { preparePanel, room } from './test-utils';
import { saveOrShareCsv } from '../closures/save-or-share-csv';
import { ReportRows } from './report-rows';

import type * as Context from '../context';

beforeEach(() => {
	preparePanel();
	mockState.screenSize = 'lg';
	mockState.register = 'r';
	mockState.names = { r: 'Front' };
	mockState.from = mockState.to = '2026-07-15';
	setOrders([
		{ uuid: 'a', number: '42', total: '10', payment_method: 'cash', status: 'completed' },
	] as Context.ReportOrder[]);
	jest.mocked(saveOrShareCsv).mockReset().mockResolvedValue();
});
afterEach(() => {
	jest.restoreAllMocks();
	jest.useRealTimers();
});
// Losing shell scope/count, wrong export inputs, or leaving the hero mounted on phone breaks these.
it('opens the payments panel with its title, scope line and footer count', async () => {
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	expect(screen.getByTestId('dialog-shell').dataset).toMatchObject({
		side: 'right',
		host: 'reports',
	});
	expect(screen.getByTestId('detail-panel').textContent).toContain('Sales by payment method');
	expect(screen.getByTestId('detail-panel-scope').textContent).toBe('Today · Wed 15 Jul · Front');
	expect(screen.getByTestId('detail-panel-footer').textContent).toContain('1 orders · £10.00');
	expect(within(screen.getByTestId('detail-panel-body')).getByText('Cash')).toBeTruthy();
	fireEvent.click(screen.getByTestId('detail-panel-export'));
	await waitFor(() =>
		expect(saveOrShareCsv).toHaveBeenCalledWith(
			'"Method","Orders","Amount","Share"\r\n"Cash","1","£10.00","100.0%"\r\n"Total","1","£10.00",""',
			'sales-payments-2026-07-15-2026-07-15.csv'
		)
	);
	fireEvent.click(screen.getByTestId('detail-panel-close'));
	expect(screen.queryByTestId('detail-panel')).toBeNull();
});
it('the phone page shows the crumb and returns on back', () => {
	mockState.screenSize = 'sm';
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	expect(screen.queryByTestId('hero-total')).toBeNull();
	expect(screen.getByTestId('detail-panel-crumb').textContent).toContain('Sales');
	expect(screen.queryByTestId('detail-panel-close')).toBeNull();
	fireEvent.click(screen.getByTestId('detail-panel-back'));
	expect(screen.getByTestId('hero-total')).toBeTruthy();
	expect(screen.queryByTestId('detail-panel-body')).toBeNull();
});
it('an export failure shows the message', async () => {
	jest.mocked(saveOrShareCsv).mockRejectedValue(new Error('disk full'));
	room();
	fireEvent.click(screen.getByTestId('card-payments-open'));
	fireEvent.click(screen.getByTestId('detail-panel-export'));
	await waitFor(() =>
		expect(screen.getByTestId('detail-panel-export-error').textContent).toBe(
			'Export failed. Try again.'
		)
	);
});
it('renders labelled phone rows and a period-neutral empty line', () => {
	mockState.screenSize = 'sm';
	const spec = {
		head: ['Product', 'Qty', 'Amount'],
		keys: ['product', 'qty', 'amount'],
		types: ['text', 'number', 'money'] as ('text' | 'number' | 'money')[],
		totalRaw: ['All products', 1.5, 3],
		rows: [{ key: 'one', cells: ['Tea', '1.5', '£3.00'], raw: ['Tea', 1.5, 3] }],
		total: ['All products', '1.5', '£3.00'],
		align: ['left', 'right', 'right'] as const,
	};
	const view = render(<ReportRows spec={{ ...spec, align: [...spec.align] }} testID="rows" />);
	expect(screen.getByTestId('rows-row-one').textContent).toBe('TeaQty1.5Amount£3.00');
	expect(screen.getByTestId('rows-total').textContent).toBe('All products£3.00');
	view.rerender(<ReportRows spec={{ ...spec, align: [...spec.align], rows: [] }} testID="rows" />);
	expect(screen.getByText('Nothing in this period')).toBeTruthy();
});
