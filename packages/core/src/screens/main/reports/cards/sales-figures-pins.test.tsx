/** @jest-environment jsdom */
import * as React from 'react';

import { screen } from '@testing-library/react';

import { mockState, render, setOrders } from './test-utils';
import { PeriodSection } from './index';

import type { SalesFigures } from '../report/sales-figures';

// Which named figure each card reads. A pin fails when a card starts reading another figure:
// change the name it reads, and this table, on purpose. The cards are gross (ledger 35, 36);
// each `decoy` is the panel's net-of-refunds figure the card must not show.
const pin = {
	key: 'pin',
	label: 'Pinned',
	name: 'Pinned',
	amount: 1,
	orders: 1,
	quantity: 1,
	share: 1,
};
const decoy = { ...pin, key: 'decoy', label: 'Decoy', name: 'Decoy' };
const parts = (row: typeof pin) => ({ parts: [row], unknownLines: 0, totalLines: 1 });
beforeEach(() => {
	setOrders([]);
	mockState.screenSize = 'lg';
	mockState.figures = {
		gross: 3,
		items: 4,
		takenByTender: [pin],
		byChannel: [pin],
		byCashier: [pin],
		products: { gross: [pin], netOfRefunds: () => [decoy] },
		categories: { gross: () => parts(pin), netOfRefunds: () => parts(decoy) },
		brands: { gross: () => parts(pin), netOfRefunds: () => parts(decoy) },
		margin: { shown: () => true, shownNetOfRefunds: () => false },
		taxesByRate: { rows: [], net: 5, tax: 6, gross: 11 },
		refunds: { refunded: 7, ordersWithRefunds: 1, orders: 1, kept: 0, keptShare: 0 },
		orderStats: {
			count: 1,
			average: 8,
			median: 0,
			largest: 0,
			items: 0,
			itemsPerOrder: 0,
			discounts: 0,
		},
	} as unknown as Partial<SalesFigures>;
});
it.each([
	['card-payments-donut-row-pin', 'takenByTender'],
	['card-where-sold-donut-row-pin', 'byChannel'],
	['card-categories-donut-row-pin', 'categories.gross'],
	['card-brands-donut-row-pin', 'brands.gross (shown by margin.shown)'],
	['card-cashiers-donut-row-pin', 'byCashier'],
])('%s reads %s', (testID) => {
	render(<PeriodSection />);
	expect(screen.getByTestId(testID)).toBeTruthy();
	expect(screen.queryByText('Decoy')).toBeNull();
});
it('Top products reads products.gross, and its head reads items', () => {
	render(<PeriodSection />);
	expect(screen.getByTestId('card-products-row-0').textContent).toContain('Pinned');
	expect(screen.getByTestId('card-products-figure').textContent).toBe('4');
});
it('the heads read gross; Taxes, Refunds and Orders read their own figures', () => {
	render(<PeriodSection />);
	for (const id of ['payments', 'where-sold', 'categories'])
		expect(screen.getByTestId(`card-${id}-figure`).textContent).toBe('£3.00');
	expect(screen.getByTestId('card-taxes-tax').textContent).toBe('£6.00');
	expect(screen.getByTestId('card-refunds-refunded').textContent).toBe('£7.00');
	expect(screen.getByTestId('card-orders-average').textContent).toBe('£8.00');
});
