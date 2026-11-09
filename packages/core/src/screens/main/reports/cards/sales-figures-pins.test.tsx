/** @jest-environment jsdom */
import * as React from 'react';

import { screen, within } from '@testing-library/react';

import { createTestT } from '../../../../../jest/translate';
import { panelSpec } from '../panels/specs';
import { salesFigures } from '../report/sales-figures';
import { mockProducts, mockState, render, setOrders } from './test-utils';
import { PeriodSection } from './index';

import type { RefundRow, ReportOrder } from '../context';
import type { SalesFigures } from '../report/sales-figures';

// Which named figure each card reads. A pin fails when a card starts reading another figure:
// change the name it reads, and this table, on purpose. Top products and Categories read their
// panels' figures, net of the period refunds (Paul 2026-11-09); each `decoy` is a figure the
// card must not show.
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
		products: { netOfRefunds: () => [pin] },
		categories: { netOfRefunds: () => parts(pin) },
		brands: { gross: () => parts(pin), netOfRefunds: () => parts(decoy) },
		margin: { shownNetOfRefunds: () => true },
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
	['card-categories-donut-row-pin', 'categories.netOfRefunds'],
	['card-brands-donut-row-pin', 'brands.gross (shown by margin.shownNetOfRefunds)'],
	['card-cashiers-donut-row-pin', 'byCashier'],
])('%s reads %s', (testID) => {
	render(<PeriodSection />);
	expect(screen.getByTestId(testID)).toBeTruthy();
	expect(screen.queryByText('Decoy')).toBeNull();
});
it('Top products reads products.netOfRefunds, and its head reads items', () => {
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

// A period with a refund: the card's rows are its panel's rows (Paul 2026-11-09, ruling 1).
describe('Top products and Categories show what their panels show', () => {
	const t = createTestT();
	// The store's money format, so a panel cell reads as the card prints it.
	const formats = {
		money: (n: number | null | undefined) =>
			`${Number(n) < 0 ? '-' : ''}£${Math.abs(Number(n)).toFixed(2)}`,
		number: String,
		quantity: String,
		percent: String,
	};
	const orders = [
		{
			id: 1,
			uuid: 'sale',
			total: '60',
			status: 'completed',
			line_items: [
				{ product_id: 1, name: 'Shirt', quantity: 2, total: '40' },
				{ product_id: 2, name: 'Hat', quantity: 1, total: '20' },
			],
		},
	] as ReportOrder[];
	const refunds = [
		{
			id: 9,
			parent_id: 1,
			amount: '30',
			line_items: [
				{ product_id: 1, name: 'Shirt', quantity: -1.5, total: '-30' },
				// Sold before the period: only the refund line names it, and only it carries a cost.
				{
					product_id: 3,
					name: 'Scarf',
					quantity: -1,
					total: '-5',
					cost_of_goods_sold: { value: -2 },
				},
			],
		},
	] as RefundRow[];
	const directory = [
		{ id: 1, categories: [{ id: 10, name: 'Tops' }] },
		{ id: 2, categories: [{ id: 11, name: 'Hats' }] },
		{ id: 3, categories: [{ id: 12, name: 'Scarves' }] },
	];
	beforeEach(() => {
		setOrders(orders);
		mockState.data = { ...mockState.data, periodRefunds: refunds };
		mockProducts.next(directory);
	});
	afterEach(() => mockProducts.next([]));
	const panel = (id: 'products' | 'categories') =>
		panelSpec(id, salesFigures({ orders, refunds, decimals: 2 }), formats, t, {
			orders,
			names: { cashier: {}, register: {}, store: {} },
			directory,
		});
	it('Top products', async () => {
		render(<PeriodSection />);
		const rows = panel('products').rows;
		expect(rows.map((row) => [row.cells[0], row.cells[2]])).toEqual([
			['Hat', '£20.00'],
			['Shirt', '£10.00'],
			['Scarf', '-£5.00'],
		]);
		for (const [index, row] of rows.entries()) {
			const shown = await screen.findByTestId(`card-products-row-${index}`);
			expect(shown.textContent).toContain(row.cells[0]);
			expect(shown.textContent).toContain(row.cells[2]);
		}
	});
	it('Categories', async () => {
		render(<PeriodSection />);
		const rows = panel('categories').rows;
		expect(rows.map((row) => [row.key, row.raw[2]])).toEqual([
			['11', 20],
			['10', 10],
			['12', -5],
		]);
		for (const row of rows)
			expect(
				within(await screen.findByTestId(`card-categories-donut-row-${row.key}`)).getByText(
					row.cells[2]
				)
			).toBeTruthy();
	});
	it('both wait for the period refunds, as their panels do', () => {
		mockState.data = { ...mockState.data, periodRefunds: undefined };
		render(<PeriodSection />);
		expect(screen.getByTestId('card-products-loading')).toBeTruthy();
		expect(screen.getByTestId('card-categories-loading')).toBeTruthy();
	});
	it('the Brands slot opens on a cost only a refund line carries, as its panel margin does', async () => {
		render(<PeriodSection />);
		expect(await screen.findByTestId('card-brands')).toBeTruthy();
	});
});
