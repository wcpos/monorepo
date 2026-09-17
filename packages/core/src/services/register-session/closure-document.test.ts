import type { ClosureRow } from '@wcpos/database';

import { buildClosureDocument, buildXReportDocument } from './closure-document';
// Copied key contract from plugin templates/gallery/preview-data/closure.json (closure-template).
const dateKeys = [
	'datetime',
	'date',
	'time',
	'datetime_short',
	'datetime_long',
	'datetime_full',
	'date_short',
	'date_long',
	'date_full',
	'date_ymd',
	'date_dmy',
	'date_mdy',
	'weekday_short',
	'weekday_long',
	'day',
	'month',
	'month_short',
	'month_long',
	'year',
];
const row: ClosureRow = {
	id: 'c',
	session_id: 's',
	register_id: 'r',
	store_id: 1,
	number: 42,
	opened_at: '2026-09-11T08:00:00Z',
	closed_at: '2026-09-11T17:00:00Z',
	till_expected: { cash: '180.0000' },
	expected: { cash: '180.0000' },
	counted: { cash: '178.0000' },
	variance: { cash: '-2.0000' },
	period_sales_total: '250.0000',
	period_refunds_total: '50.0000',
	perpetual_sales_total: '5250.0000',
	perpetual_refunds_total: '250.0000',
	unsynced_count: 2,
	unsynced_total: '12.0000',
	software_version: 'preview',
	breakdowns: {
		register_name: 'Main register',
		opened_by_name: 'Alex',
		closed_by_name: 'Alex',
		payment_methods: { cash: { name: 'Cash', sales: '130.0000', refunds: '50.0000' } },
		tax_rates: { vat: { name: 'VAT 20%', net: '166.6667', tax: '33.3333', gross: '200.0000' } },
		opening_float: { expected: '100.0000', counted: '100.0000', variance: '0.0000' },
		movements: [
			{
				type: 'paid_out',
				amount: '5.0000',
				reason: 'Petty cash',
				voided_by: 'sample-void',
				created_at_gmt: '2026-09-11 10:00:00',
			},
		],
		cashiers: ['1'],
		transaction_count: 12,
		refund_count: 2,
	},
	order_ids: [],
	movement_ids: [],
	print_count: 0,
	sync_status: 'synced',
	sync_attempts: 0,
};
const context = {
	store: { name: 'Shop' },
	currency: 'USD',
	timezone: 'Europe/Madrid',
	locale: 'en-US',
	printedAt: '2026-09-12T09:00:00Z',
	formatMoney: (v: string) =>
		v === ''
			? ''
			: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v)),
	i18n: { paid_out: 'Paid out', over: 'Over', short: 'Short', exact: 'Exact' },
};
// Revert: pass local maps/ISO dates directly to Mustache, omit money companions, or mutate recorded data.
it('maps a local snapshot into the server closure envelope and display companions', () => {
	const before = JSON.stringify(row);
	const doc = buildClosureDocument(row, context);
	expect(Object.keys(doc).sort()).toEqual([
		'closure',
		'fiscal',
		'i18n',
		'order',
		'register',
		'software',
		'store',
	]);
	expect(Object.keys(doc.closure.opened_at).sort()).toEqual(dateKeys.sort());
	expect(doc.closure.opened_at.time).toBe('10:00');
	expect(doc.closure.opened_at.date_ymd).toBe('2026-09-11');
	expect(doc.closure.tenders[0]).toMatchObject({
		name: 'cash',
		label: 'Cash',
		expected: '180.0000',
		expected_display: '$180.00',
		counted_display: '$178.00',
		variance_display: '-$2.00',
		has_variance: true,
		variance_label: 'Short',
		variance_absolute_display: '$2.00',
	});
	expect(doc.closure).toMatchObject({
		has_sales: true,
		has_perpetual: true,
		has_movements: true,
		has_payment_methods: true,
		has_tax_rates: true,
	});
	expect(doc.closure.period_sales_total_display).toBe('$250.00');
	expect(doc.closure.breakdowns.payment_methods).toEqual([
		{
			name: 'Cash',
			sales: '130.0000',
			refunds: '50.0000',
			sales_display: '$130.00',
			refunds_display: '$50.00',
		},
	]);
	expect(doc.closure.breakdowns.tax_rates[0]).toMatchObject({
		net_display: '$166.67',
		tax_display: '$33.33',
		gross_display: '$200.00',
	});
	expect(doc.closure.breakdowns.movements[0]).toMatchObject({
		type_label: 'Paid out',
		voided: true,
		amount_display: '$5.00',
	});
	expect(doc.closure.breakdowns.labels).toMatchObject({
		opened_by_name: 'Alex',
		closed_by_name: 'Alex',
	});
	expect(doc.fiscal).toMatchObject({
		document_type: 'closure',
		receipt_number: '42',
		is_closure_document: true,
		is_x_report: false,
		is_reprint: false,
		reprint_count: 0,
	});
	expect(doc.register.name).toBe('Main register');
	expect(doc.order).toMatchObject({ currency: 'USD', printed: { time: '11:00' } });
	expect(JSON.stringify(row)).toBe(before);
});
// Revert: omit local copy marking or number the X-report.
it('marks local copies but never numbers or persists an X-report', () => {
	expect(buildClosureDocument({ ...row, print_count: 2 }, context).fiscal).toMatchObject({
		is_reprint: true,
		reprint_count: 2,
	});
	const session = {
		id: 's',
		register_id: 'r',
		status: 'open' as const,
		opened_at_gmt: row.opened_at,
		counted_float: '100',
		sync_status: 'pending' as const,
		sync_attempts: 0,
	};
	const doc = buildXReportDocument(session, { ...context, expected: { cash: '110.0000' } });
	expect(doc.closure).not.toHaveProperty('number');
	expect(doc.fiscal).toMatchObject({
		document_type: 'xreport',
		is_closure_document: true,
		receipt_number: '',
		is_x_report: true,
		is_reprint: false,
	});
	expect(doc.closure.tenders[0].expected).toBe('110.0000');
});

// Revert: drop any server-template financial section flags/companions at the document seam.
it('renders the shipped closure template financial sections and matches the fixture field tree', () => {
	const fixture = require('./__fixtures__/closure.json');
	const html = require('fs').readFileSync(
		require('path').join(__dirname, '__fixtures__/closure-default.html'),
		'utf8'
	);
	const doc = buildClosureDocument(row, { ...context, i18n: { ...fixture.i18n, ...context.i18n } });
	const rendered = require('@wcpos/receipt-renderer/render-template').renderLogiclessTemplate(
		html,
		doc
	);
	for (const amount of ['$250.00', '$5,250.00', '$5.00', '$166.67', '$130.00'])
		expect(rendered).toContain(amount);
	expect(Object.keys(doc.closure.tenders[0]).sort()).toEqual(
		Object.keys(fixture.closure.tenders[0]).sort()
	);
	expect(Object.keys(doc.closure.opened_at).sort()).toEqual(
		Object.keys(fixture.closure.opened_at).sort()
	);
	for (const key of Object.keys(fixture.closure).filter(
		(key) => key.endsWith('_display') || key.startsWith('has_')
	))
		expect(doc.closure).toHaveProperty(key);
});
// Revert: let the shared printer normalizer discard closure fields before thermal encoding.
it('keeps the closure envelope through printer normalization and formatting', () => {
	const { mapReceiptData } = require('@wcpos/printer/encoder/map-receipt-data');
	const { formatReceiptData } = require('@wcpos/printer/encoder/format-receipt-data');
	const { renderThermalPreview } = require('@wcpos/receipt-renderer/render-template');
	const doc = buildClosureDocument(row, context);
	const formatted = formatReceiptData(mapReceiptData(mapReceiptData(doc)));
	const html = renderThermalPreview(
		'<receipt><text>{{closure.number}} {{closure.period_sales_total_display}}</text></receipt>',
		formatted
	);
	expect(html).toContain('42 $250.00');
	expect(formatted.order.printed).toEqual(doc.order.printed);
});
