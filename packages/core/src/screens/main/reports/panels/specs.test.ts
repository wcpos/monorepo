import { createTestT } from '../../../../../jest/translate';
import { cashiers, categories, taxesByRate, tenders, topProducts } from '../cards/aggregate';
import { calculateTotals } from '../report/utils';
import { panelSpec } from './specs';

import type { ReportOrder } from '../context';

const money = (value: number | null | undefined) => `£${Number(value).toFixed(2)}`;
function inputs(orders: ReportOrder[]) {
	const totals = calculateTotals({ orders });
	return {
		payments: tenders(orders, totals),
		products: topProducts(orders, totals),
		categories: categories(orders, [], totals),
		cashiers: cashiers(totals),
		taxes: taxesByRate(orders, totals),
		orders,
		totals,
		cashierNames: { '7': 'Sam' },
		formats: {
			money,
			number: String,
			quantity: (n: number | null | undefined) => `qty:${n}`,
			percent: (n: number | null | undefined) => Number(n).toFixed(1),
		},
		t: createTestT(),
	};
}
// Wrong columns, truncation, monetary quantity formatting, and per-order rather than per-refund rows break these.
it('payments rows carry method, orders, amount and share with a total', () => {
	const spec = panelSpec(
		'payments',
		inputs([{ uuid: 'a', total: '10', payment_method: 'cash' }] as ReportOrder[])
	);
	expect(spec.head).toEqual(['Method', 'Orders', 'Amount', 'Share']);
	expect(spec.rows[0].cells).toEqual(['Cash', '1', '£10.00', '100.0%']);
	expect(spec.total).toEqual(['Total', '1', '£10.00', '']);
});
it('the products panel lists every product, not four', () => {
	const spec = panelSpec(
		'products',
		inputs([
			{
				uuid: 'a',
				total: '50',
				line_items: Array.from({ length: 5 }, (_, i) => ({
					product_id: i + 1,
					name: `Product ${i}`,
					quantity: 1.5,
					total: '10',
				})),
			},
		] as ReportOrder[])
	);
	expect(spec.rows).toHaveLength(5);
	expect(spec.rows[4].cells).toEqual(['Product 4', 'qty:1.5', '£10.00']);
	expect(spec.total).toEqual(['All products', 'qty:7.5', '£50.00']);
});
it('taxes gross is net plus tax and a dash without a net', () => {
	const data = inputs([]);
	data.taxes = {
		rows: [
			{ rateId: 1, label: 'VAT', net: 10, tax: 2, share: 0.5 },
			{ rateId: 2, label: '', net: null, tax: 2, share: 0.5 },
		],
		net: 10,
		tax: 4,
		gross: 14,
	};
	const spec = panelSpec('taxes', data);
	expect(spec.rows.map((row) => row.cells)).toEqual([
		['VAT', '£10.00', '£2.00', '£12.00'],
		['Unknown', '—', '£2.00', '—'],
	]);
	expect(spec.total).toEqual(['Total', '£10.00', '£4.00', '£14.00']);
});
it('refunds lists one row per embedded refund with the absolute amount', () => {
	const spec = panelSpec(
		'refunds',
		inputs([
			{
				uuid: 'a',
				number: '42',
				refunds: [
					{ id: 1, reason: 'Damaged', total: '-2' },
					{ id: 2, total: '-3' },
				],
			},
		] as ReportOrder[])
	);
	expect(spec.rows.map((row) => row.cells)).toEqual([
		['#42', 'Damaged', '£2.00'],
		['#42', '—', '£3.00'],
	]);
	expect(new Set(spec.rows.map((row) => row.key)).size).toBe(2);
	expect(spec.total).toEqual(['Refunded', '', '£5.00']);
});
it('cashiers average is amount over orders', () => {
	const data = inputs([]);
	data.orders = [{ uuid: 'a' }, { uuid: 'b' }] as ReportOrder[];
	data.cashiers = [{ key: '7', orders: 2, amount: 15, share: 1 }];
	data.totals = { ...data.totals, total: 15, averageOrderValue: 7.5 };
	const spec = panelSpec('cashiers', data);
	expect(spec.rows[0].cells).toEqual(['Sam', '2', '£7.50', '£15.00']);
	expect(spec.total).toEqual(['Total', '2', '£7.50', '£15.00']);
});
it('categories retain unknown and uncategorised rows and fractional quantities', () => {
	const data = inputs([]);
	data.categories.parts = [
		{ key: 'unknown', label: '', quantity: 1.5, amount: 3, share: 0.75 },
		{ key: 'uncategorised', label: '', quantity: 1, amount: 1, share: 0.25 },
	];
	expect(panelSpec('categories', data).rows.map((row) => row.cells)).toEqual([
		['Unknown product', 'qty:1.5', '£3.00', '75.0%'],
		['Uncategorised', 'qty:1', '£1.00', '25.0%'],
	]);
});
