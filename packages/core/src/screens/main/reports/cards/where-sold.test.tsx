/** @jest-environment jsdom */
import * as React from 'react';

import { act, fireEvent, screen } from '@testing-library/react';

import { mockState, mockStores, render, setOrders } from './test-utils';
import { WhereSoldCard } from './where-sold';

import type { ReportOrder } from '../context';

beforeEach(() => {
	mockState.storeFilter = '9';
	mockStores.next([
		{ id: 7, name: 'Front shop' },
		{ id: 9, name: 'Back shop' },
	]);
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
	mockState.figures = {
		registersStamped: [
			{ registerId: 'abcdefgh-1234', totalAmount: 6, totalOrders: 1 },
			{ registerId: 'second-register', totalAmount: 3, totalOrders: 1 },
		],
	};
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
	mockState.figures = { registersStamped: mockState.figures!.registersStamped!.slice(0, 1) };
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

it('offers Stores only for All stores on a multi-store site, never Registers there', () => {
	const view = render(<WhereSoldCard />);
	expect(screen.queryByTestId('card-where-sold-view-segment-stores')).toBeNull();
	mockState.storeFilter = 'woocommerce-pos';
	view.rerender(<WhereSoldCard />);
	expect(screen.getByTestId('card-where-sold-view-segment-stores')).toBeTruthy();
	expect(screen.queryByTestId('card-where-sold-view-segment-registers')).toBeNull();
	act(() => mockStores.next([{ id: 7, name: 'Only shop' }]));
	expect(screen.queryByTestId('card-where-sold-view-segment-stores')).toBeNull();
});
it('names store rows and remainders, counts only stores, and opens the Stores panel', () => {
	mockState.storeFilter = 'woocommerce-pos';
	setOrders([
		{ total: '6', created_via: 'woocommerce-pos', meta_data: [{ key: '_pos_store', value: '7' }] },
		{ total: '3', created_via: 'woocommerce-pos', meta_data: [{ key: '_pos_store', value: '99' }] },
		{ total: '4', created_via: 'checkout' },
		{ total: '2', created_via: 'woocommerce-pos' },
	] as ReportOrder[]);
	const context = jest.requireMock<typeof import('../context')>('../context');
	const setDetail = jest.fn();
	const spy = jest
		.spyOn(context, 'useReportsScope')
		.mockReturnValue({ ...context.useReportsScope(), setDetail });
	try {
		const view = render(<WhereSoldCard />);
		fireEvent.click(screen.getByTestId('card-where-sold-view-segment-stores'));
		for (const [key, name] of [
			['7', 'Front shop'],
			['99', 'Unknown'],
			['online', 'Online'],
			['unassigned', 'No store'],
		]) {
			expect(screen.getByTestId(`card-where-sold-donut-row-${key}`).textContent).toContain(name);
		}
		expect(screen.getByTestId('card-where-sold-donut').textContent).toContain('2 stores');
		expect(screen.getByTestId('card-where-sold-figure').textContent).toBe('£15.00');
		fireEvent.click(screen.getByTestId('card-where-sold-open'));
		expect(setDetail).toHaveBeenLastCalledWith('stores');
		mockState.storeFilter = '7';
		view.rerender(<WhereSoldCard />);
		fireEvent.click(screen.getByTestId('card-where-sold-open'));
		expect(setDetail).toHaveBeenLastCalledWith('channels');
	} finally {
		spy.mockRestore();
	}
});
it('shows line skeletons while the All stores directory has not emitted', () => {
	mockState.storeFilter = 'woocommerce-pos';
	mockStores.next(undefined);
	render(<WhereSoldCard />);
	expect(screen.queryByTestId('card-where-sold-donut')).toBeNull();
	expect(
		screen.getByTestId('card-where-sold').querySelectorAll('[aria-busy]').length
	).toBeGreaterThan(0);
	act(() =>
		mockStores.next([
			{ id: 7, name: 'Front shop' },
			{ id: 9, name: 'Back shop' },
		])
	);
	fireEvent.click(screen.getByTestId('card-where-sold-view-segment-stores'));
	expect(screen.getByTestId('card-where-sold-donut')).toBeTruthy();
});
