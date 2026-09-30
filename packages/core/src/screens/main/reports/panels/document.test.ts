import { createTestT } from '../../../../../jest/translate';
import {
	cashiers,
	categories,
	channels,
	registers,
	taxesByRate,
	tenders,
	topProducts,
} from '../cards/aggregate';
import { calculateTotals } from '../report/utils';
import { buildReportDocument } from './document';
import { panelSpec } from './specs';
import fixture from './__fixtures__/report-sales.json';

import type { DetailId, ReportOrder } from '../context';

const orders = [
	{
		uuid: 'one',
		number: '42',
		total: '10',
		payment_method: 'cash',
		line_items: [{ product_id: 1, name: 'Tea', quantity: 1.5, total: '10' }],
	},
] as ReportOrder[];
const totals = calculateTotals({ orders });
const inputs = {
	orders,
	totals,
	payments: tenders(orders, totals),
	products: topProducts(orders, totals),
	categories: categories(orders, [], totals),
	cashiers: cashiers(totals),
	channels: channels(orders, totals),
	registers: registers(totals),
	registerNames: {},
	taxes: taxesByRate(orders, totals),
	cashierNames: {},
	formats: {
		money: (n: number | null | undefined) => `£${Number(n).toFixed(2)}`,
		number: String,
		quantity: String,
		percent: String,
	},
	t: createTestT(),
};
const context = {
	store: fixture.store,
	currency: 'GBP',
	timezone: 'America/New_York',
	locale: 'en-GB',
	printedAt: '2026-07-15T13:00:00Z',
	formatMoney: String,
	i18n: fixture.i18n,
};
function document(id: DetailId) {
	const spec = panelSpec(id, inputs);
	return buildReportDocument(
		spec,
		spec.keys.map((key, i) => ({
			key,
			label: spec.head[i],
			type: spec.types[i],
			align: spec.align[i],
		})),
		{
			key: id,
			title: 'Sales',
			label: 'Today · Front',
			storeId: 1,
			registerId: 'front',
			registerName: 'Front',
			from: '2026-07-15T04:00:00Z',
			to: '2026-07-16T03:59:59Z',
			generatedAt: context.printedAt,
		},
		context
	);
}
// Wrong wire types, omitted totals, drifting cell order or client-local dates invalidate reports.
it("builds a document the plugin's validator accepts: column_count equals the columns and every cells array lists the column keys in order", () => {
	for (const id of ['payments', 'orders'] as const) {
		const doc = document(id),
			report = doc.report;
		expect(Object.keys(doc)).toEqual(
			expect.arrayContaining(['report', 'store', 'register', 'software', 'fiscal', 'i18n'])
		);
		expect(doc.fiscal).toMatchObject({
			document_type: 'report',
			is_report_document: true,
			is_sale_document: false,
			is_refund_document: false,
			is_closure_document: false,
		});
		expect(report.column_count).toBe(report.columns.length);
		expect(report.group_by).toBeNull();
		for (const row of [...report.rows, report.totals]) {
			expect(row.cells.map((cell) => cell.key)).toEqual(report.columns.map((col) => col.key));
			for (const cell of row.cells) expect(typeof cell.value).toBe('string');
		}
	}
	expect(document('payments').report.rows[0].cells[2]).toMatchObject({
		key: 'amount',
		value: '10',
		formatted: '£10.00',
	});
});
it("every panel's totals lists the column keys in order", () => {
	for (const id of [
		'payments',
		'orders',
		'products',
		'categories',
		'cashiers',
		'channels',
		'registers',
		'taxes',
		'refunds',
	] as const) {
		const { report } = document(id);
		expect(report.totals.cells.map((cell) => cell.key)).toEqual(
			report.columns.map((col) => col.key)
		);
		for (const row of report.rows) expect(row.key).toMatch(/^[^_]/);
	}
	expect(document('orders').report.totals.cells.map((cell) => cell.value)).toEqual([
		'Counted',
		'',
		'',
		'',
		'10',
		'',
	]);
});
it("generated_at and the scope dates are the server's date bundles", () => {
	const { report } = document('payments');
	for (const bundle of [report.generated_at, report.scope.from, report.scope.to])
		expect(Object.keys(bundle).sort()).toEqual(Object.keys(fixture.report.generated_at).sort());
	expect(report.scope).toMatchObject({
		mode: 'range',
		business_day: '2026-07-15',
		from: { date_ymd: '2026-07-15', time: '00:00' },
		to: { date_ymd: '2026-07-15', time: '23:59' },
	});
	expect(report.generated_at.time).toBe('09:00');
});
