/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { mockState, setOrders } from './test-utils';
import { OrdersCard } from './orders';

import type { ReportOrder } from '../context';

beforeEach(() => {
	mockState.statusMode = 'all';
});
// A wrong status count, omitted attention state or legend count must fail visibly.
it('Nothing needs you when nothing is processing, on hold or pending', () => {
	setOrders([{ status: 'completed', total: '12' }] as ReportOrder[]);
	render(<OrdersCard />);
	expect(screen.getByTestId('card-orders-needs').textContent).toBe('Nothing needs you');
});
it('lists the processing and on-hold counts otherwise', () => {
	setOrders([
		{ status: 'processing' },
		{ status: 'on-hold' },
		{ status: 'on-hold' },
	] as ReportOrder[]);
	render(<OrdersCard />);
	expect(screen.getByTestId('card-orders-needs').textContent).toBe('1 processing · 2 on hold');
});
it('the status legend shows the counts, a refunded order in its own part', () => {
	setOrders([
		{ status: 'completed', refunds: [{ total: '-1' }] },
		{ status: 'completed' },
		{ status: 'processing' },
		{ status: 'processing' },
	] as ReportOrder[]);
	render(<OrdersCard />);
	for (const [status, count] of [
		['completed', '1'],
		['processing', '2'],
		['refunded', '1'],
	])
		expect(screen.getByTestId(`card-orders-status-${status}`).textContent).toBe(count);
});
it('a partially refunded processing order still needs you', () => {
	setOrders([{ status: 'processing', refunds: [{ total: '-1' }] }] as ReportOrder[]);
	render(<OrdersCard />);
	expect(screen.getByTestId('card-orders-needs').textContent).toBe('1 processing');
	expect(screen.getByTestId('card-orders-status-refunded').textContent).toBe('1');
});
it('items sold keep a fractional quantity under a zero-decimal currency', () => {
	const saved = mockState.store;
	mockState.store = { ...saved!, currency: 'JPY', price_num_decimals: 0 };
	setOrders([
		{ status: 'completed', total: '300', line_items: [{ quantity: 1.5 }] },
	] as ReportOrder[]);
	render(<OrdersCard />);
	expect(screen.getByTestId('card-orders-items').textContent).toBe('1.5');
	expect(screen.getByTestId('card-orders-average').textContent).toBe('¥300');
	mockState.store = saved;
});
