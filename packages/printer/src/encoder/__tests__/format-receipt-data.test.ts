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
		expect(result.totals.grand_total_incl_display).toBe('$25.00');
		expect(result.totals.tax_total_display).toBe('$2.27');
		expect(result.totals.subtotal_display).toBe('$25.00');
		expect(result.totals.discount_total_display).toBe('$0.00');
		expect(result.totals.grand_total_display).toBe('$25.00');
	});

	it('preserves original numeric totals', () => {
		const result = formatReceiptData(sampleReceiptData);
		expect(result.totals.subtotal_incl).toBe(25.0);
		expect(result.totals.grand_total_incl).toBe(25.0);
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
		data.meta.currency = 'EUR';
		data.presentation_hints.locale = 'de-DE';
		const result = formatReceiptData(data);
		// German locale — verify EUR symbol and comma decimal separator
		expect(result.totals.grand_total_incl_display).toMatch(/[€]|EUR/);
		expect(result.totals.grand_total_incl_display).toContain(',');
	});

	it('normalizes underscore locale tags from presentation_hints', () => {
		const data = structuredClone(sampleReceiptData);
		data.meta.currency = 'EUR';
		data.presentation_hints.locale = ' de_DE ';
		const result = formatReceiptData(data);
		expect(result.totals.grand_total_incl_display).toContain(',');
	});

	it('preserves non-numeric fields unchanged', () => {
		const result = formatReceiptData(sampleReceiptData);
		expect(result.store.name).toBe('My Test Store');
		expect(result.meta.order_number).toBe('1042');
		expect(result.cashier.name).toBe('Jane');
		expect(result.lines[0].name).toBe('Widget A');
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
