/** @jest-environment jsdom */
import * as React from 'react';

import { render, screen } from '@testing-library/react';

import { mockProducts, setOrders } from './test-utils';
import { PeriodSection } from './index';

import type { ReportOrder } from '../context';

beforeEach(() => {
	mockProducts.next([{ id: 1 }]);
	setOrders([
		{
			uuid: 'a',
			total: '10',
			cost_of_goods_sold: {},
			line_items: [{ product_id: 1, total: '10', quantity: 1 }],
		},
	] as ReportOrder[]);
});
// A slot left behind when off, dropping unbranded sales, or concealing a missing join breaks these.
it('absent when the feature is off', () => {
	setOrders([{ uuid: 'a', total: '10' }] as ReportOrder[]);
	render(<PeriodSection />);
	expect(screen.queryByTestId('card-brands')).toBeNull();
});
it('No brand and the empty line when no product has a brand', () => {
	render(<PeriodSection />);
	expect(screen.getByTestId('card-brands-donut-row-nobrand').textContent).toContain('No brand');
	expect(screen.getByTestId('card-brands-empty').textContent).toBe('No brands on these products');
});
it('names the lines without a local product', () => {
	mockProducts.next([]);
	render(<PeriodSection />);
	expect(screen.getByTestId('card-brands-unknown').textContent).toBe(
		'1 of 1 lines have no local product'
	);
});
it('appears from a joined product alone between Categories and Cashiers', () => {
	setOrders([
		{ uuid: 'a', total: '10', line_items: [{ product_id: 1, total: '10' }] },
	] as ReportOrder[]);
	mockProducts.next([{ id: 1, cost_of_goods_sold: {}, brands: [{ id: 2, name: 'Acme' }] }]);
	render(<PeriodSection />);
	expect(screen.getByTestId('card-brands-donut-row-2').textContent).toContain('Acme');
	const ids = Array.from(
		screen.getByTestId('reports-period-section').querySelectorAll('[data-testid]')
	)
		.map((node) => node.getAttribute('data-testid'))
		.filter((id) => /^card-(categories|brands|cashiers)$/.test(id!));
	expect(ids).toEqual(['card-categories', 'card-brands', 'card-cashiers']);
});
