import { describe, expect, it } from 'vitest';

import {
	isPushableOrderStatus,
	orderChangesAssertIntent,
	PUSHABLE_ORDER_STATUSES,
	SERVER_AUTHORED_ORDER_MONEY_FIELDS,
	SERVER_OWNED_ORDER_FIELDS,
	SERVER_OWNED_ORDER_META_KEYS,
	stripServerAuthoredOrderMoney,
	toOrderWirePayload,
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
		const payload = { status: 'pos-open', line_items: [] };
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
		expect(orderChangesAssertIntent({ status: 'on-hold' })).toBe(true);
		expect(orderChangesAssertIntent({ line_items: [] })).toBe(true);
	});
});

it('keeps the durable money-owner hint as outbound intent', () => {
	const meta_data = [{ key: '_wcpos_money_owner_hint', value: 'server' }];
	expect(orderChangesAssertIntent({ meta_data })).toBe(true);
	expect(stripServerAuthoredOrderMoney({ meta_data, total: '99', total_tax: '9' })).toEqual({
		meta_data,
	});
});

// ADR 0040 rule 2: the server derives paid from its own payment rows and drops
// these keys from a push (Pos_Order_Audit). The till never asserts them.
describe('the order wire (ADR 0040)', () => {
	it('drops every server-owned and client-local key and keeps the rest of meta_data', () => {
		const kept = [
			{ id: 1, key: '_woocommerce_pos_uuid', value: 'u' },
			{ key: '_wcpos_money_owner_hint', value: 'server' },
			{ key: 'custom', value: 'kept' },
		];
		const payload = {
			customer_note: 'note',
			set_paid: true,
			date_paid: '2026-10-20T10:00:00',
			date_paid_gmt: '2026-10-20T10:00:00',
			transaction_id: 'txn',
			payment_method: 'pos_cash',
			payment_method_title: 'Cash',
			total: '10.00',
			meta_data: [
				...kept,
				...SERVER_OWNED_ORDER_META_KEYS.map((key, id) => ({ id: 100 + id, key, value: 'x' })),
			],
		};
		expect(toOrderWirePayload(payload)).toEqual({ customer_note: 'note', meta_data: kept });
		expect([...SERVER_OWNED_ORDER_FIELDS].sort()).toEqual(
			[
				'date_paid',
				'date_paid_gmt',
				'payment_method',
				'payment_method_title',
				'set_paid',
				'transaction_id',
			].sort()
		);
		expect(SERVER_OWNED_ORDER_META_KEYS).toEqual(
			expect.arrayContaining([
				'_wcpos_payments',
				'_wcpos_payment_method',
				'_wcpos_completed_at',
				'_wcpos_completions',
				'_paid_date',
			])
		);
		const clean = { customer_note: 'note', status: 'pos-open', meta_data: kept };
		expect(toOrderWirePayload(clean)).toBe(clean);
		expect(stripServerAuthoredOrderMoney).toBe(toOrderWirePayload);
	});

	it('drops a non-pushable status, normalising wc-, and keeps each pushable one', () => {
		expect([...PUSHABLE_ORDER_STATUSES]).toEqual(['pos-open', 'pending', 'on-hold', 'cancelled']);
		for (const status of PUSHABLE_ORDER_STATUSES) {
			expect(toOrderWirePayload({ status })).toEqual({ status });
			expect(isPushableOrderStatus(`wc-${status}`)).toBe(true);
		}
		for (const status of ['completed', 'processing', 'pos-partial', 'refunded', 'wc-completed']) {
			expect(isPushableOrderStatus(status)).toBe(false);
			expect(toOrderWirePayload({ status, customer_note: 'n' })).toEqual({ customer_note: 'n' });
		}
		expect(isPushableOrderStatus(undefined)).toBe(false);
	});

	it('server-owned keys, unchanged meta or an unchanged status assert nothing', () => {
		const meta = [
			{ id: 1, key: 'custom', value: 'a' },
			{ id: 2, key: '_wcpos_payments', value: { schema: 1, payments: [] } },
		];
		const current = { status: 'pending', meta_data: meta };
		const ledger = { key: '_wcpos_payments', value: { schema: 1, payments: [{ id: 'p' }] } };
		expect(orderChangesAssertIntent({ transaction_id: 'txn', payment_method: 'cash' })).toBe(false);
		expect(orderChangesAssertIntent({ status: 'completed' }, current)).toBe(false);
		expect(orderChangesAssertIntent({ status: 'pending' }, current)).toBe(false);
		expect(orderChangesAssertIntent({ meta_data: [meta[0], ledger] }, current)).toBe(false);
		expect(
			orderChangesAssertIntent({ status: 'pos-partial', meta_data: [meta[0], ledger] }, current)
		).toBe(false);
	});

	it('a meta_data change to a till-owned key still asserts intent', () => {
		const current = { meta_data: [{ id: 1, key: 'custom', value: 'a' }] };
		expect(
			orderChangesAssertIntent({ meta_data: [{ id: 1, key: 'custom', value: 'b' }] }, current)
		).toBe(true);
		expect(orderChangesAssertIntent({ status: 'on-hold' }, { status: 'pending' })).toBe(true);
	});
});
