import { describe, expect, it } from 'vitest';

import {
	orderChangesAssertIntent,
	SERVER_AUTHORED_ORDER_MONEY_FIELDS,
	stripServerAuthoredOrderMoney,
} from './orderWriteContract';

/**
 * The list is the WooCommerce 10.4.3 order schema's readonly money, verified
 * against `Version2/class-wc-rest-orders-v2-controller.php`. Pinned as a value
 * so a future edit has to be a deliberate re-reading of that schema.
 */
describe('the server-authored order money', () => {
	it('is exactly the readonly aggregate, and does not reach into the lines', () => {
		expect([...SERVER_AUTHORED_ORDER_MONEY_FIELDS]).toEqual([
			'discount_total',
			'discount_tax',
			'shipping_total',
			'shipping_tax',
			'cart_tax',
			'total',
			'total_tax',
			'tax_lines',
		]);
	});

	it('is dropped from an outbound payload, leaving the lines the POS does assert', () => {
		const payload = {
			status: 'pos-open',
			total: '36.68',
			total_tax: '6.71',
			cart_tax: '6.71328',
			discount_total: '0.00',
			discount_tax: '0.00',
			shipping_total: '0.00',
			shipping_tax: '0.00',
			tax_lines: [{ rate_id: 1, tax_total: '6.71328' }],
			line_items: [{ id: 3, subtotal: '30.00', total: '30.00', total_tax: '6.71328' }],
			shipping_lines: [{ id: 4, total: '0.00' }],
			fee_lines: [{ id: 5, total: '0.00' }],
		};

		expect(stripServerAuthoredOrderMoney(payload)).toEqual({
			status: 'pos-open',
			line_items: [{ id: 3, subtotal: '30.00', total: '30.00', total_tax: '6.71328' }],
			shipping_lines: [{ id: 4, total: '0.00' }],
			fee_lines: [{ id: 5, total: '0.00' }],
		});
	});

	it('returns the same reference when there was no aggregate to drop', () => {
		const payload = { status: 'processing', line_items: [] };
		expect(stripServerAuthoredOrderMoney(payload)).toBe(payload);
	});
});

describe('whether an order change set asserts anything', () => {
	it('says no to a pure settlement — every field of it is the server’s', () => {
		expect(
			orderChangesAssertIntent({
				discount_total: '5.00',
				discount_tax: '0.00',
				shipping_total: '0.00',
				shipping_tax: '0.00',
				cart_tax: '6.71328',
				total_tax: '6.71',
				total: '36.68',
				tax_lines: [{ rate_id: 1, tax_total: '6.71328' }],
				date_modified_gmt: '2026-08-23T10:00:00',
			})
		).toBe(false);
	});

	it('says no to a bare revision stamp', () => {
		expect(orderChangesAssertIntent({ date_modified_gmt: '2026-08-23T10:00:00' })).toBe(false);
	});

	it('says yes as soon as one field is the cashier’s intent', () => {
		// The settlement's own percent-fee output is intent: `fee_lines[].total`
		// is writable and the server keeps it.
		expect(
			orderChangesAssertIntent({ total: '36.68', fee_lines: [{ id: 5, total: '3.00' }] })
		).toBe(true);
		expect(orderChangesAssertIntent({ status: 'processing' })).toBe(true);
		expect(orderChangesAssertIntent({ line_items: [] })).toBe(true);
	});
});
