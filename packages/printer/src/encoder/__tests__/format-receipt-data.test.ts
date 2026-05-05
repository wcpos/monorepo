import { describe, expect, it } from 'vitest';

import { formatReceiptData } from '../format-receipt-data';
import { sampleReceiptData } from './fixtures';

describe('formatReceiptData', () => {
	it('returns an object (does not mutate input)', () => {
		const original = structuredClone(sampleReceiptData);
		const result = formatReceiptData(sampleReceiptData);
		expect(result).not.toBe(sampleReceiptData);
		expect(sampleReceiptData).toEqual(original);
	});

	it('adds _display variants for line item prices', () => {
		const result = formatReceiptData(sampleReceiptData);
		const line = result.lines[0];
		expect(line.unit_price_incl_display).toBe('$5.00');
		expect(line.line_total_incl_display).toBe('$10.00');
		expect(line.unit_price_display).toBe('$5.00');
		expect(line.line_subtotal_display).toBe('$10.00');
		expect(line.discounts_display).toBe('$0.00');
		expect(line.line_total_display).toBe('$10.00');
	});

	it('preserves original numeric line item fields', () => {
		const result = formatReceiptData(sampleReceiptData);
		const line = result.lines[0];
		expect(line.unit_price_incl).toBe(5.0);
		expect(line.line_total_incl).toBe(10.0);
	});

	it('adds _display variants for totals', () => {
		const result = formatReceiptData(sampleReceiptData);
		expect(result.totals.subtotal_incl_display).toBe('$25.00');
		expect(result.totals.total_incl_display).toBe('$25.00');
		expect(result.totals.tax_total_display).toBe('$2.27');
		expect(result.totals.subtotal_display).toBe('$25.00');
		expect(result.totals.discount_total_display).toBe('$0.00');
		expect(result.totals.total_display).toBe('$25.00');
	});

	it('preserves original numeric totals', () => {
		const result = formatReceiptData(sampleReceiptData);
		expect(result.totals.subtotal_incl).toBe(25.0);
		expect(result.totals.total_incl).toBe(25.0);
		expect(result.totals.tax_total).toBe(2.27);
	});

	it('adds _display variants for payment amounts', () => {
		const result = formatReceiptData(sampleReceiptData);
		expect(result.payments[0].amount_display).toBe('$25.00');
		expect(result.payments[0].tendered_display).toBe('$30.00');
		expect(result.payments[0].change_display).toBe('$5.00');
	});

	it('adds _display variants for tax summary', () => {
		const result = formatReceiptData(sampleReceiptData);
		expect(result.tax_summary[0].tax_amount_display).toBe('$2.27');
	});

	it('adds amount_display to per-line taxes', () => {
		const data = structuredClone(sampleReceiptData);
		data.lines[0].taxes = [{ code: 'vat-10', rate: 10, label: 'VAT 10%', amount: 0.91 }];
		const result = formatReceiptData(data);
		expect(result.lines[0].taxes[0].amount_display).toBe('$0.91');
		expect(result.lines[0].taxes[0].amount).toBe(0.91);
	});

	it('adds amount_display to fee and shipping taxes', () => {
		const data = structuredClone(sampleReceiptData);
		data.fees = [
			{
				label: 'Service Fee',
				total_incl: 2.5,
				total_excl: 2.27,
				taxes: [{ code: 'vat-10', rate: 10, label: 'VAT 10%', amount: 0.23 }],
			},
		];
		data.shipping = [
			{
				label: 'Standard shipping',
				method_id: 'flat_rate',
				total_incl: 6.0,
				total_excl: 4.96,
				taxes: [{ code: 'vat-21', rate: 21, label: 'VAT 21%', amount: 1.04 }],
			},
		];
		const result = formatReceiptData(data);
		expect(result.fees[0].taxes?.[0].amount_display).toBe('$0.23');
		expect(result.shipping[0].taxes?.[0].amount_display).toBe('$1.04');
	});

	it('adds localized labels to store tax IDs without labels', () => {
		const data = structuredClone(sampleReceiptData);
		data.store.tax_ids = [{ type: 'sa_vat', value: '398563834163360', country: 'SA' }];
		data.i18n = {
			...data.i18n,
			store_tax_id_label_sa_vat: 'ضريبة القيمة المضافة',
		};

		const result = formatReceiptData(data);

		expect(result.store.tax_ids?.[0].label).toBe('ضريبة القيمة المضافة');
	});

	it('falls back to a built-in default label per type when no i18n key is provided', () => {
		const data = structuredClone(sampleReceiptData);
		data.store.tax_ids = [
			{ type: 'au_abn', value: '12345678901', country: 'AU' },
			{ type: 'eu_vat', value: 'DE123456789', country: 'DE' },
			{ type: 'gb_company', value: '12345678', country: 'GB' },
		];

		const result = formatReceiptData(data);

		expect(result.store.tax_ids?.[0].label).toBe('ABN');
		expect(result.store.tax_ids?.[1].label).toBe('VAT ID');
		expect(result.store.tax_ids?.[2].label).toBe('Company No.');
	});

	it('falls back to "Tax ID" for unknown types when neither i18n nor built-in default exists', () => {
		const data = structuredClone(sampleReceiptData);
		data.store.tax_ids = [{ type: 'other', value: 'XYZ-99' }];

		const result = formatReceiptData(data);

		expect(result.store.tax_ids?.[0].label).toBe('Tax ID');
	});

	it('resolves customer tax IDs through the same label pipeline (per-type defaults)', () => {
		const data = structuredClone(sampleReceiptData);
		data.customer.tax_ids = [
			{ type: 'au_abn', value: '12345678901', country: 'AU' },
			{ type: 'us_ein', value: '12-3456789', country: 'US' },
		];

		const result = formatReceiptData(data);

		expect(result.customer.tax_ids?.[0].label).toBe('ABN');
		expect(result.customer.tax_ids?.[1].label).toBe('EIN');
	});

	it('lets a customer-scoped i18n key override the built-in default', () => {
		const data = structuredClone(sampleReceiptData);
		data.customer.tax_ids = [{ type: 'au_abn', value: '12345678901', country: 'AU' }];
		data.i18n = { ...data.i18n, customer_tax_id_label_au_abn: 'Customer ABN' };

		const result = formatReceiptData(data);

		expect(result.customer.tax_ids?.[0].label).toBe('Customer ABN');
	});

	it('keeps explicit label values without overwriting them', () => {
		const data = structuredClone(sampleReceiptData);
		data.customer.tax_ids = [
			{ type: 'au_abn', value: '12345678901', country: 'AU', label: 'Australian Business No.' },
		];

		const result = formatReceiptData(data);

		expect(result.customer.tax_ids?.[0].label).toBe('Australian Business No.');
	});

	it('signs per-line tax amount on refund renders', () => {
		const data = structuredClone(sampleReceiptData);
		data.lines[0].taxes = [{ code: 'vat-10', rate: 10, label: 'VAT 10%', amount: 0.91 }];
		data.fees = [
			{
				label: 'Service Fee',
				total_incl: 2.5,
				total_excl: 2.27,
				taxes: [{ code: 'vat-10', rate: 10, label: 'VAT 10%', amount: 0.23 }],
			},
		];
		data.shipping = [
			{
				label: 'Standard shipping',
				method_id: 'flat_rate',
				total_incl: 6.0,
				total_excl: 4.96,
				taxes: [{ code: 'vat-21', rate: 21, label: 'VAT 21%', amount: 1.04 }],
			},
		];
		data.refunds = [{ id: 1, amount: 5, lines: [] }];
		const result = formatReceiptData(data);
		expect(result.lines[0].taxes[0].amount).toBe(-0.91);
		expect(result.lines[0].taxes[0].amount_display).toBe('-$0.91');
		expect(result.fees[0].taxes?.[0].amount_display).toBe('-$0.23');
		expect(result.shipping[0].taxes?.[0].amount_display).toBe('-$1.04');
	});

	it('adds _display variants for fees and discounts', () => {
		const data = structuredClone(sampleReceiptData);
		data.fees = [{ label: 'Service Fee', total_incl: 2.5, total_excl: 2.27 }];
		data.discounts = [{ label: '10% Off', total_incl: 5.0, total_excl: 4.55 }];
		const result = formatReceiptData(data);
		expect(result.fees[0].total_incl_display).toBe('$2.50');
		expect(result.discounts[0].total_incl_display).toBe('$5.00');
	});

	it('uses locale from presentation_hints', () => {
		const data = structuredClone(sampleReceiptData);
		data.order.currency = 'EUR';
		data.presentation_hints.locale = 'de-DE';
		const result = formatReceiptData(data);
		// German locale — verify EUR symbol and comma decimal separator
		expect(result.totals.total_incl_display).toMatch(/[€]|EUR/);
		expect(result.totals.total_incl_display).toContain(',');
	});

	it('normalizes underscore locale tags from presentation_hints', () => {
		const data = structuredClone(sampleReceiptData);
		data.order.currency = 'EUR';
		data.presentation_hints.locale = ' de_DE ';
		const result = formatReceiptData(data);
		expect(result.totals.total_incl_display).toContain(',');
	});

	it('uses prices_entered_with_tax fallback for display aliases when tax display is hidden', () => {
		const data = structuredClone(sampleReceiptData);
		data.presentation_hints.display_tax = 'hidden';
		data.presentation_hints.prices_entered_with_tax = false;
		delete data.lines[0].unit_price;
		delete data.lines[0].line_subtotal;
		delete data.lines[0].discounts;
		delete data.lines[0].line_total;
		delete data.totals.subtotal;
		delete data.totals.discount_total;
		delete data.totals.total;
		data.fees = [{ label: 'Service Fee', total_incl: 2.5, total_excl: 2.27 }];
		data.shipping = [{ label: 'Flat Rate', total_incl: 3.5, total_excl: 3.18 }];
		data.discounts = [{ label: 'Promo', total_incl: 1.5, total_excl: 1.36 }];

		const result = formatReceiptData(data);

		expect(result.lines[0].unit_price_display).toBe('$4.55');
		expect(result.lines[0].line_subtotal_display).toBe('$9.09');
		expect(result.lines[0].discounts_display).toBe('$0.00');
		expect(result.lines[0].line_total_display).toBe('$9.09');
		expect(result.fees[0].total_display).toBe('$2.27');
		expect(result.shipping[0].total_display).toBe('$3.18');
		expect(result.discounts[0].total_display).toBe('$1.36');
		expect(result.totals.subtotal_display).toBe('$22.73');
		expect(result.totals.discount_total_display).toBe('$0.00');
		expect(result.totals.total_display).toBe('$22.73');
	});

	it('preserves non-numeric fields unchanged', () => {
		const result = formatReceiptData(sampleReceiptData);
		expect(result.store.name).toBe('My Test Store');
		expect(result.order.number).toBe('1042');
		expect(result.cashier.name).toBe('Jane');
		expect(result.lines[0].name).toBe('Widget A');
	});

	it('exposes order metadata and i18n labels for templates', () => {
		const result = formatReceiptData(sampleReceiptData);
		expect(result.order).toMatchObject({
			id: sampleReceiptData.order.id,
			number: sampleReceiptData.order.number,
			created: { datetime: sampleReceiptData.order.created.datetime },
		});
		expect(result.i18n).toMatchObject({
			order: 'Order',
			date: 'Date',
			subtotal: 'Subtotal',
			total: 'Total',
		});
	});

	it('passes through a fully populated data.order without clobbering its date object', () => {
		const data = structuredClone(sampleReceiptData);
		const fullDate = {
			datetime: 'Apr 30, 2026, 2:08 PM',
			date: 'Apr 30, 2026',
			time: '2:08 PM',
			datetime_short: '4/30/26, 2:08 PM',
			datetime_long: 'April 30, 2026, 2:08 PM',
			datetime_full: 'Thursday, April 30, 2026, 2:08 PM',
			date_short: '4/30/26',
			date_long: 'April 30, 2026',
			date_full: 'Thursday, April 30, 2026',
			date_ymd: '2026-04-30',
			date_dmy: '30/04/2026',
			date_mdy: '04/30/2026',
			weekday_short: 'Thu',
			weekday_long: 'Thursday',
			day: '30',
			month: '04',
			month_short: 'Apr',
			month_long: 'April',
			year: '2026',
		};
		data.order = {
			id: 1287,
			number: '1287',
			currency: 'EUR',
			customer_note: '',
			created: fullDate,
			paid: fullDate,
			completed: fullDate,
		};

		const result = formatReceiptData(data);

		// The full ReceiptDateSchema must survive — templates that read
		// {{order.created.date_long}} etc. depend on every key being there.
		expect(result.order).toEqual(data.order);
		expect(result.order.created.date_long).toBe('April 30, 2026');
		expect(result.order.created.datetime).toBe('Apr 30, 2026, 2:08 PM');
	});

	it('preserves custom i18n labels over gallery-template defaults', () => {
		const data = structuredClone(sampleReceiptData);
		data.i18n = { total: 'Total Refunded' };
		const result = formatReceiptData(data);

		expect(result.i18n.total).toBe('Total Refunded');
		expect(result.i18n.subtotal).toBe('Subtotal');
	});

	it('honors a custom i18n.refund_total override on refund receipts', () => {
		const data = structuredClone(sampleReceiptData);
		data.refunds = [{ id: 1, amount: 25, lines: [] }];
		data.i18n = { refund_total: 'Reembolso' };
		const result = formatReceiptData(data);

		expect(result.i18n.total).toBe('Reembolso');
	});

	it('uses a custom i18n.total fallback on refund receipts without refund_total', () => {
		const data = structuredClone(sampleReceiptData);
		data.refunds = [{ id: 1, amount: 25, lines: [] }];
		data.i18n = { total: 'Total Refunded' };
		const result = formatReceiptData(data);

		expect(result.i18n.total).toBe('Total Refunded');
	});

	it('renders refund receipts with negative display amounts and refund labels', () => {
		const data = structuredClone(sampleReceiptData);
		data.refunds = [{ id: 1, amount: 25, lines: [] }];
		const result = formatReceiptData(data);

		expect(result.i18n.total).toBe('Refund Total');
		expect(result.lines[0].line_total_incl).toBe(-10);
		expect(result.totals.subtotal_incl).toBe(-25);
		expect(result.totals.total_incl).toBe(-25);
		expect(result.tax_summary[0].tax_amount).toBe(-2.27);
		expect(result.payments[0].method_title).toBe('Refund — Cash');
		expect(result.payments[0].amount).toBe(-25);
	});

	it('preserves zero numeric values for Mustache section truthiness', () => {
		const data = structuredClone(sampleReceiptData);
		data.totals.discount_total_incl = 0;
		const result = formatReceiptData(data);
		// Raw value stays 0 (falsy) so {{#totals.discount_total_incl}} correctly skips
		expect(result.totals.discount_total_incl).toBe(0);
		// Display variant still shows formatted currency
		expect(result.totals.discount_total_incl_display).toBe('$0.00');
	});
});
