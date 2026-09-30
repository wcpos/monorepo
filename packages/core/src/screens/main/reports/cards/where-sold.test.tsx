/** @jest-environment jsdom */
import * as React from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import { mockState, setOrders } from './test-utils';
import { WhereSoldCard } from './where-sold';

import type { ReportOrder } from '../context';

beforeEach(() => {
	// The till's orders carry their register; the online order (ruling A admits it) has none.
	setOrders([
		{
			total: '6',
			created_via: 'woocommerce-pos',
			meta_data: [{ key: '_wcpos_register', value: 'abcdefgh-1234' }],
		},
		{
			total: '3',
			created_via: 'woocommerce-pos',
			meta_data: [{ key: '_wcpos_register', value: 'second-register' }],
		},
		{ total: '4', created_via: 'checkout' },
	] as ReportOrder[]);
	mockState.data.totals.registerArray = [
		{ registerId: 'abcdefgh-1234', totalAmount: 6, totalOrders: 1 },
		{ registerId: 'second-register', totalAmount: 3, totalOrders: 1 },
	];
	mockState.register = undefined;
	mockState.names = {};
	mockState.namesReady = true;
});
// Wrong grouping, leaked ids, premature names, or a stale view's head target break these contracts.
it('channels view names In store and Online with their shares', () => {
	render(<WhereSoldCard />);
	expect(screen.getByTestId('card-where-sold-figure').textContent).toBe('£13.00');
	for (const [key, label, amount, share, orders] of [
		['store', 'In store', '£9.00', '69.2%', '2 orders'],
		['online', 'Online', '£4.00', '30.8%', '1 order'],
	]) {
		const row = screen.getByTestId(`card-where-sold-donut-row-${key}`);
		for (const value of [label, amount, share, orders]) expect(row.textContent).toContain(value);
	}
	expect(screen.getByTestId('card-where-sold-donut').textContent).toContain('2 channels');
});
it('the view control appears only under All registers with more than one register', () => {
	const view = render(<WhereSoldCard />);
	expect(screen.getByTestId('card-where-sold-view')).toBeTruthy();
	mockState.register = 'abcdefgh-1234';
	view.rerender(<WhereSoldCard />);
	expect(screen.queryByTestId('card-where-sold-view')).toBeNull();
	mockState.register = undefined;
	mockState.data.totals.registerArray = mockState.data.totals.registerArray.slice(0, 1);
	view.rerender(<WhereSoldCard />);
	expect(screen.queryByTestId('card-where-sold-view')).toBeNull();
});
it('registers view waits for the names then shows them', () => {
	mockState.namesReady = false;
	const view = render(<WhereSoldCard />);
	fireEvent.click(screen.getByTestId('card-where-sold-view-segment-registers'));
	expect(screen.getByTestId('card-where-sold').querySelectorAll('[aria-busy]')).toHaveLength(3);
	expect(screen.queryByTestId('card-where-sold-donut')).toBeNull();
	mockState.namesReady = true;
	mockState.names = { 'abcdefgh-1234': 'Front' };
	view.rerender(<WhereSoldCard />);
	expect(screen.getByTestId('card-where-sold-donut-row-abcdefgh-1234').textContent).toContain(
		'Front'
	);
	const unnamed = screen.getByTestId('card-where-sold-donut-row-second-register');
	expect(unnamed.textContent).toContain('Unknown');
	expect(unnamed.textContent).not.toContain('second-register');
	expect(screen.getByTestId('card-where-sold-donut').textContent).toContain('2 registers');
	// The online order has no register: its own row, so the parts still sum to the figure.
	const online = screen.getByTestId('card-where-sold-donut-row-online');
	expect(online.textContent).toContain('Online');
	expect(online.textContent).not.toContain('Unknown');
});
it('no sales in period', () => {
	setOrders([]);
	render(<WhereSoldCard />);
	expect(screen.getByTestId('card-where-sold-empty').textContent).toBe('No sales in this period');
	expect(screen.queryByTestId('card-where-sold-donut')).toBeNull();
});
it('opening the head opens the panel of the current view', () => {
	const context = jest.requireMock<typeof import('../context')>('../context');
	const real = jest.requireActual<typeof import('../context')>('../context');
	const spy = jest.spyOn(context, 'useReportsScope').mockImplementation(real.useReportsScope);
	function Detail() {
		return <span data-testid="open-detail">{context.useReportsScope().detail}</span>;
	}
	const tree = () => (
		<real.ReportsScopeProvider>
			<WhereSoldCard />
			<Detail />
		</real.ReportsScopeProvider>
	);
	try {
		const view = render(tree());
		fireEvent.click(screen.getByTestId('card-where-sold-open'));
		expect(screen.getByTestId('open-detail').textContent).toBe('channels');
		fireEvent.click(screen.getByTestId('card-where-sold-view-segment-registers'));
		fireEvent.click(screen.getByTestId('card-where-sold-open'));
		expect(screen.getByTestId('open-detail').textContent).toBe('registers');
		mockState.register = 'abcdefgh-1234';
		view.rerender(tree());
		fireEvent.click(screen.getByTestId('card-where-sold-open'));
		expect(screen.getByTestId('open-detail').textContent).toBe('channels');
		expect(screen.getByTestId('card-where-sold-donut-row-store').textContent).toContain('In store');
	} finally {
		spy.mockRestore();
	}
});
