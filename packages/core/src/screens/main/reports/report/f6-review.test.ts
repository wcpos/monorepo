import sumBy from 'lodash/sumBy';

import { salesFigures } from './sales-figures';

import type { RefundRow, ReportOrder } from '../context';

// Review cases for F6 (#3601): the head equals the line sum in every scope shape.
const directory = [
	// Multi-category: counted once, under its first category.
	{
		id: 1,
		categories: [
			{ id: 10, name: 'Food' },
			{ id: 11, name: 'Gifts' },
		],
		brands: [{ id: 50 }],
	},
	// Uncategorised, no brand.
	{ id: 2, categories: [] },
	{ id: 3, categories: [{ id: 11, name: 'Gifts' }], brands: [{ id: 51 }] },
];

it('refunds, a multi-category product, uncategorised and unknown lines: head = line sum (review)', () => {
	const orders = [
		{
			total: '117.5',
			shipping_total: '5',
			line_items: [
				{ product_id: 1, total: '30', total_tax: '3', quantity: 1 },
				{ product_id: 2, total: '20', quantity: 2 },
				{ product_id: 99, total: '12.5', quantity: 1 }, // no local product
				{ product_id: 3, total: '47', quantity: 1 },
			],
		},
	] as ReportOrder[];
	// A line refund of product 3, sold in an earlier period, plus an amount-only refund.
	const refunds = [
		{ line_items: [{ product_id: 3, total: '-50', total_tax: '-5', quantity: -1 }] },
		{ total: '-7', line_items: [] },
	] as unknown as RefundRow[];
	const figures = salesFigures({ orders, refunds, decimals: 2 });
	const cats = figures.categories.netOfRefunds(directory);
	const lineSum = 30 + 3 + 20 + 12.5 + 47 - 50 - 5;
	expect(cats.total).toBe(lineSum);
	expect(sumBy(cats.parts, 'amount')).toBeCloseTo(cats.total, 10);
	expect(sumBy(cats.parts, 'share')).toBeCloseTo(1, 10);
	expect(cats.parts.map((p) => p.key).sort()).toEqual(['10', '11', 'uncategorised', 'unknown']);
	expect(figures.brands.netOfRefunds(directory).total).toBe(cats.total);
	// Knowingly not the hero: gross includes shipping and is before refunds.
	expect(figures.gross).not.toBe(cats.total);
});
