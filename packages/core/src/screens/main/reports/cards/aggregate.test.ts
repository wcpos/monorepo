import {
	cashiers,
	categories,
	channels,
	ordersSummary,
	refundsSummary,
	registers,
	statusCounts,
	taxesByRate,
	tenders,
	topProducts,
} from './aggregate';
import { calculateTotals } from '../report/utils';

import type { ReportOrder } from '../context';

const orders = (rows: Partial<ReportOrder>[]) => rows as ReportOrder[];
const totals = (rows: ReportOrder[]) => calculateTotals({ orders: rows });
// These fixtures catch incorrect median indexing, rounding, grouping and zero denominators.
describe('ordersSummary', () => {
	it('median averages the two middle totals of an even count', () => {
		const rows = orders([{ total: '40' }, { total: '10' }, { total: '20' }, { total: '30' }]);
		expect(ordersSummary(rows, totals(rows)).median).toBe(25);
	});
	it('median of an odd count is the middle total', () => {
		const rows = orders([{ total: '40' }, { total: '10' }, { total: '20' }]);
		expect(ordersSummary(rows, totals(rows))).toMatchObject({ median: 20, largest: 40 });
	});
	it('largest is null with no orders', () => {
		expect(ordersSummary([], totals([]))).toMatchObject({ largest: null, median: 0 });
	});
	it('items per order rounds to one decimal', () => {
		const rows = orders([{ line_items: [{ quantity: 4 }] }, {}, {}]);
		expect(ordersSummary(rows, totals(rows)).itemsPerOrder).toBe(1.3);
	});
});
describe('statusCounts', () => {
	it('under done only completed and processing segments appear', () => {
		expect(statusCounts([], 'done').segments.map((row) => row.status)).toEqual([
			'completed',
			'processing',
		]);
	});
	it('under all, pending and on-hold appear when present', () => {
		const rows = orders([{ status: 'pending' }, { status: 'on-hold' }]);
		expect(statusCounts(rows, 'all').segments.map((row) => row.status)).toEqual([
			'completed',
			'processing',
			'on-hold',
			'pending',
		]);
		expect(statusCounts([], 'all').segments.map((row) => row.status)).toEqual([
			'completed',
			'processing',
		]);
	});
	it('an order carrying a refund is the Refunded part, not its status part', () => {
		const rows = orders([
			{ status: 'completed', refunds: [{ total: '-2' }, { total: '-3' }] },
			{ status: 'completed', refunds: [] },
		]);
		expect(statusCounts(rows, 'done')).toMatchObject({
			refunded: 1,
			segments: [
				{ status: 'completed', count: 1 },
				{ status: 'processing', count: 0 },
			],
		});
	});
	it('needsYou counts processing, on-hold and pending', () => {
		const rows = orders([
			{ status: 'processing' },
			{ status: 'processing' },
			{ status: 'on-hold' },
			{ status: 'pending' },
		]);
		expect(statusCounts(rows, 'all').needsYou).toEqual({ processing: 2, onHold: 1, pending: 1 });
	});
});
describe('topProducts', () => {
	it('keys a variation line by variation_id and a simple line by product_id', () => {
		const rows = orders([
			{
				total: '12',
				line_items: [
					{
						product_id: 1,
						variation_id: 2,
						name: 'Variant',
						quantity: 1,
						total: '5',
						total_tax: '1',
					},
					{ product_id: 1, name: 'Simple', quantity: 2, total: '3', total_tax: '0' },
					{ name: 'Custom', quantity: 1, total: '3' },
				],
			},
		]);
		expect(topProducts(rows, totals(rows))).toMatchObject([
			{ key: 2, name: 'Variant', quantity: 1, amount: 6, share: 0.5 },
			{ key: 'Custom', name: 'Custom', quantity: 1, amount: 3, share: 0.25 },
			{ key: 1, name: 'Simple', quantity: 2, amount: 3, share: 0.25 },
		]);
	});
	it('ranks by gross amount descending, ties by name', () => {
		const rows = orders([
			{
				line_items: [
					{ name: 'B', total: '10' },
					{ name: 'A', total: '10' },
					{ name: 'C', total: '9', total_tax: '2' },
				],
			},
		]);
		expect(topProducts(rows, totals(rows)).map((row) => row.name)).toEqual(['C', 'A', 'B']);
	});
	it('counts a non-finite quantity as zero', () => {
		const rows = orders([
			{
				line_items: [
					{ name: 'A', quantity: NaN },
					{ name: 'A', quantity: Infinity },
					{ name: 'A', quantity: 2 },
				],
			},
		]);
		expect(topProducts(rows, totals(rows))[0]).toMatchObject({ quantity: 2, share: 0 });
	});
});
describe('taxesByRate', () => {
	it('sums tax_total and shipping_tax_total per rate', () => {
		const rows = orders([
			{
				total_tax: '9',
				tax_lines: [
					{ rate_id: 1, tax_total: '2', shipping_tax_total: '1' },
					{ rate_id: 1, tax_total: '4', shipping_tax_total: '2' },
				],
			},
		]);
		expect(taxesByRate(rows, totals(rows)).rows[0]).toMatchObject({ rateId: 1, tax: 9, share: 1 });
	});
	it("a rate's net is the sum of the lines it taxed, products and shipping alike", () => {
		const rows = orders([
			{
				total: '132',
				total_tax: '22',
				tax_lines: [{ rate_id: 1, tax_total: '20', shipping_tax_total: '2' }],
				line_items: [
					{ total: '60', taxes: [{ id: 1, total: '12' }] },
					{ total: '40', taxes: [{ id: 1, total: '8' }] },
				],
				shipping_lines: [{ total: '10', taxes: [{ id: 1, total: '2' }] }],
			},
		]);
		expect(taxesByRate(rows, totals(rows))).toMatchObject({
			rows: [{ rateId: 1, net: 110 }],
			net: 110,
			tax: 22,
			gross: 132,
		});
	});
	it('two rates on the same goods both carry that net', () => {
		const rows = orders([
			{
				total: '112',
				total_tax: '12',
				tax_lines: [
					{ rate_id: 1, tax_total: '10' },
					{ rate_id: 2, tax_total: '2' },
				],
				line_items: [
					{
						total: '100',
						taxes: [
							{ id: 1, total: '10' },
							{ id: 2, total: '2' },
						],
					},
				],
			},
		]);
		expect(taxesByRate(rows, totals(rows)).rows.map((row) => row.net)).toEqual([100, 100]);
	});
	it("a line taxed at zero still counts toward its rate's net", () => {
		const rows = orders([
			{
				total: '50',
				total_tax: '0',
				tax_lines: [{ rate_id: 3, tax_total: '0' }],
				line_items: [{ total: '50', taxes: [{ id: 3, total: '0' }] }],
			},
		]);
		expect(taxesByRate(rows, totals(rows)).rows[0]).toMatchObject({ rateId: 3, tax: 0, net: 50 });
	});
	it('an empty-string total means the rate is not on this line', () => {
		const rows = orders([
			{
				total: '80',
				total_tax: '6',
				tax_lines: [
					{ rate_id: 1, tax_total: '6' },
					{ rate_id: 2, tax_total: '0' },
				],
				line_items: [
					{
						total: '30',
						taxes: [
							{ id: 1, total: '6' },
							{ id: 2, total: '' },
						],
					},
					{
						total: '50',
						taxes: [
							{ id: 1, total: '' },
							{ id: 2, total: '0' },
						],
					},
				],
			},
		]);
		const nets = Object.fromEntries(
			taxesByRate(rows, totals(rows)).rows.map((row) => [row.rateId, row.net])
		);
		expect(nets).toEqual({ 1: 30, 2: 50 });
	});
	it('an unlabelled rate keeps its code', () => {
		const rows = orders([{ tax_lines: [{ rate_id: 7, rate_code: 'GB-VAT-1', tax_total: '1' }] }]);
		expect(taxesByRate(rows, totals(rows)).rows[0].label).toBe('GB-VAT-1');
	});
	it('net is null when no line names the rate', () => {
		const rows = orders([{ tax_lines: [{ rate_id: 1, tax_total: '20' }] }]);
		expect(taxesByRate(rows, totals(rows)).rows[0].net).toBeNull();
	});
	it('share is 0 when there is no tax', () => {
		const rows = orders([{ tax_lines: [{ rate_id: 1, tax_total: '0' }] }]);
		expect(taxesByRate(rows, totals(rows)).rows[0].share).toBe(0);
	});
});
describe('refundsSummary', () => {
	it('kept share is null with no sales', () => {
		expect(refundsSummary([], totals([])).keptShare).toBeNull();
	});
});

// Wrong ledger filtering, per-row order counts, or category joins break these fixtures.
describe('tenders', () => {
	const ledger = (payments: object[]) => [
		{ key: '_wcpos_payments', value: JSON.stringify({ schema: 1, payments }) },
	];
	it('a split sale is one order per method it touched', () => {
		const rows = orders([
			{
				total: '100',
				payment_method: 'pos_cash',
				payment_method_title: 'Cash drawer',
				meta_data: ledger([
					{ id: 'a', kind: 'cash', method_id: 'pos_cash', status: 'captured', amount: '20' },
					{ id: 'b', kind: 'cash', method_id: 'pos_cash', status: 'captured', amount: '10' },
					{ id: 'c', kind: 'card', method_id: 'stripe', status: 'captured', amount: '70' },
				]),
			},
		]);
		expect(tenders(rows, totals(rows), 2)).toEqual([
			{ key: 'stripe', label: 'stripe', amount: 70, orders: 1, share: 0.7 },
			{ key: 'cash', label: 'Cash drawer', amount: 30, orders: 1, share: 0.3 },
		]);
	});
	it('an order without a ledger is one tender of its payment method', () => {
		const rows = orders([
			{ total: '12.345', payment_method: 'bacs', payment_method_title: 'Bank' },
		]);
		expect(tenders(rows, totals(rows), 2)).toEqual([
			{ key: 'bacs', label: 'Bank', amount: 12.35, orders: 1, share: 1 },
		]);
	});
	it('an unpaid order is the unpaid tender', () => {
		const rows = orders([{ total: '12', needs_payment: true }]);
		expect(tenders(rows, totals(rows), 2)[0]).toMatchObject({
			key: 'unpaid',
			amount: 12,
			orders: 1,
		});
	});
	it('a ledger row that is not captured is not a tender', () => {
		const rows = orders([
			{
				total: '5',
				meta_data: ledger([
					{ id: 'a', kind: 'cash', method_id: 'pos_cash', status: 'captured', amount: '5' },
					{ id: 'b', kind: 'card', method_id: 'stripe', status: 'pending', amount: '9' },
				]),
			},
		]);
		expect(tenders(rows, totals(rows), 2)).toMatchObject([{ key: 'cash', amount: 5, orders: 1 }]);
	});
	it('a ledger with nothing taken attributes nothing to the method; what is owed is unpaid', () => {
		const rows = orders([
			{
				total: '9',
				needs_payment: true,
				payment_method: 'stripe',
				payment_method_title: 'Card',
				meta_data: ledger([
					{ id: 'b', kind: 'card', method_id: 'stripe', status: 'pending', amount: '9' },
				]),
			},
		]);
		expect(tenders(rows, totals(rows), 2)).toMatchObject([{ key: 'unpaid', amount: 9, orders: 1 }]);
	});
	it('an authorized row recorded offline is money taken', () => {
		const rows = orders([
			{
				total: '7',
				meta_data: ledger([
					{
						id: 'c',
						kind: 'card',
						method_id: 'sumup',
						status: 'authorized',
						recorded_offline: true,
						amount: '7',
					},
				]),
			},
		]);
		expect(tenders(rows, totals(rows), 2)).toMatchObject([{ key: 'sumup', amount: 7, orders: 1 }]);
	});
});
describe('channels', () => {
	it('POS orders are in store, everything else online', () => {
		const rows = orders([
			{ total: '30', created_via: 'woocommerce-pos' },
			{ total: '10', created_via: 'checkout' },
			{ total: '10' },
		]);
		expect(channels(rows, totals(rows))).toEqual([
			{ key: 'store', amount: 30, orders: 1, share: 0.6 },
			{ key: 'online', amount: 20, orders: 2, share: 0.4 },
		]);
	});
});
describe('cashiers', () => {
	it('sums a cashier across stores', () => {
		expect(
			cashiers({
				...totals([]),
				total: 40,
				userStoreArray: [
					{ cashierId: '7', storeId: '1', totalAmount: 10, totalOrders: 1 },
					{ cashierId: '7', storeId: '2', totalAmount: 30, totalOrders: 2 },
				],
			})
		).toEqual([{ key: '7', amount: 40, orders: 3, share: 1 }]);
	});
});
describe('registers', () => {
	it('sorts register amounts and uses the period total for shares', () => {
		expect(
			registers({
				...totals([]),
				total: 100,
				registerArray: [
					{ registerId: 'a', totalAmount: 20, totalOrders: 1 },
					{ registerId: 'b', totalAmount: 60, totalOrders: 2 },
				],
			})
		).toEqual([
			{ key: 'b', amount: 60, orders: 2, share: 0.6 },
			{ key: 'a', amount: 20, orders: 1, share: 0.2 },
		]);
	});
});
describe('categories', () => {
	const rows = orders([
		{ total: '12', line_items: [{ product_id: 1, total: '10', total_tax: '2', quantity: 1.5 }] },
	]);
	it("a line takes its product's first category", () => {
		expect(
			categories(
				rows,
				[
					{
						id: 1,
						categories: [
							{ id: 8, name: 'First' },
							{ id: 9, name: 'Second' },
						],
					},
				],
				totals(rows),
				2
			)
		).toMatchObject({
			parts: [{ key: '8', label: 'First', amount: 12, quantity: 1.5, share: 1 }],
			unknownLines: 0,
			totalLines: 1,
		});
	});
	it('a product without categories is uncategorised', () => {
		expect(categories(rows, [{ id: 1, categories: [] }], totals(rows), 2).parts[0]).toMatchObject({
			key: 'uncategorised',
			amount: 12,
		});
	});
	it('a line without a local product is the unknown row and is counted', () => {
		expect(categories(rows, [], totals(rows), 2)).toMatchObject({
			parts: [{ key: 'unknown', amount: 12, quantity: 1.5 }],
			unknownLines: 1,
			totalLines: 1,
		});
	});
});

// Using embedded refunds, counting refund rows as orders, or joining by the sale date breaks these.
it("refunded sums the period's refunds, not the orders' embedded ones", () => {
	const rows = orders([{ total: '100', refunds: [{ total: '-90' }] }]);
	expect(
		refundsSummary(
			[{ id: 1, parent_id: 4, date_created_gmt: '2026-07-15', amount: '12' }],
			totals(rows),
			2,
			rows.length
		)
	).toMatchObject({ refunded: 12, kept: 88, keptShare: 0.88 });
});
it('orders counts distinct parents', () => {
	expect(
		refundsSummary(
			[
				{ id: 1, parent_id: 4, date_created_gmt: '', amount: '2' },
				{ id: 2, parent_id: 4, date_created_gmt: '', total: '-3' },
				{ id: 3, parent_id: 5, date_created_gmt: '', amount: '4' },
			],
			totals([]),
			2,
			7
		)
	).toMatchObject({ refunded: 9, ordersWithRefunds: 2, orders: 7 });
});
it("a refund made today for last week's order counts today", () => {
	expect(
		refundsSummary(
			[{ id: 1, parent_id: 99, date_created_gmt: '2026-07-15', amount: '15' }],
			totals([])
		)
	).toMatchObject({ refunded: 15, ordersWithRefunds: 1 });
});
