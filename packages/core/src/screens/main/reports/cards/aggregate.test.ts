import { ordersSummary, refundsSummary, statusCounts, taxesByRate, topProducts } from './aggregate';
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
		expect(topProducts(rows, totals(rows))).toEqual([
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
