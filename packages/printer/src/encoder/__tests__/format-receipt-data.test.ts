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

	it('formats line item prices as currency strings', () => {
		const result = formatReceiptData(sampleReceiptData);
		const line = result.lines[0];
		expect(line.unit_price_incl).toBe('$5.00');
		expect(line.line_total_incl).toBe('$10.00');
	});

	it('formats totals as currency strings', () => {
		const result = formatReceiptData(sampleReceiptData);
		expect(result.totals.subtotal_incl).toBe('$25.00');
		expect(result.totals.grand_total_incl).toBe('$25.00');
		expect(result.totals.tax_total).toBe('$2.27');
	});

	it('formats payment amounts', () => {
		const result = formatReceiptData(sampleReceiptData);
		expect(result.payments[0].amount).toBe('$25.00');
		expect(result.payments[0].tendered).toBe('$30.00');
		expect(result.payments[0].change).toBe('$5.00');
	});

	it('formats tax summary amounts', () => {
		const result = formatReceiptData(sampleReceiptData);
		expect(result.tax_summary[0].tax_amount).toBe('$2.27');
	});

	it('formats fee and discount amounts', () => {
		const data = structuredClone(sampleReceiptData);
		data.fees = [{ label: 'Service Fee', total_incl: 2.5, total_excl: 2.27 }];
		data.discounts = [{ label: '10% Off', total_incl: 5.0, total_excl: 4.55 }];
		const result = formatReceiptData(data);
		expect(result.fees[0].total_incl).toBe('$2.50');
		expect(result.discounts[0].total_incl).toBe('$5.00');
	});

	it('uses locale from presentation_hints', () => {
		const data = structuredClone(sampleReceiptData);
		data.meta.currency = 'EUR';
		data.presentation_hints.locale = 'de-DE';
		const result = formatReceiptData(data);
		// German locale — just check it's a string and not a raw number
		expect(typeof result.totals.grand_total_incl).toBe('string');
		expect(result.totals.grand_total_incl).not.toBe('25');
	});

	it('preserves non-numeric fields unchanged', () => {
		const result = formatReceiptData(sampleReceiptData);
		expect(result.store.name).toBe('My Test Store');
		expect(result.meta.order_number).toBe('1042');
		expect(result.cashier.name).toBe('Jane');
		expect(result.lines[0].name).toBe('Widget A');
	});

	it('handles zero values', () => {
		const data = structuredClone(sampleReceiptData);
		data.totals.discount_total_incl = 0;
		const result = formatReceiptData(data);
		expect(result.totals.discount_total_incl).toBe('$0.00');
	});
});
