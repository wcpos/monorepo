import { describe, expect, it } from 'vitest';

import { tillAggregateFor } from './order-till-aggregate';

const LINES = [{ id: 3, quantity: 1, subtotal: '29.97', total: '29.97' }];
const AGGREGATE = {
	total: '36.68',
	total_tax: '6.71',
	cart_tax: '6.71328',
	discount_total: '0.00',
	discount_tax: '0.00',
	shipping_total: '0.00',
	shipping_tax: '0.00',
	tax_lines: [{ rate_id: 1, tax_total: '6.71328' }],
};

const resident = (over: Record<string, unknown> = {}) => ({
	status: 'pos-open',
	line_items: LINES,
	...AGGREGATE,
	...over,
});

describe('the till aggregate carried beside a push', () => {
	it('is the resident aggregate when the push carries the same lines', () => {
		// Both save paths (the cart's Save button and the Pay button) push through
		// usePushDocument, which enqueues the WHOLE resident payload — so lines and
		// aggregate come from one snapshot and this is the ordinary case.
		expect(tillAggregateFor({ status: 'pos-open', line_items: LINES }, resident())).toEqual(
			AGGREGATE
		);
	});

	it('does not care about key ORDER — that is not a fact about the money', () => {
		const reordered = [{ total: '29.97', subtotal: '29.97', quantity: 1, id: 3 }];
		expect(tillAggregateFor({ line_items: reordered }, resident())).toEqual(AGGREGATE);
	});

	it('declines when a cart edit moved the lines past this push', () => {
		// The resident's aggregate was settled over TWO items; the push carries one.
		// Pairing them would alarm the cashier about arithmetic neither side did.
		// That edit has its own mutation, and its push carries a consistent pair.
		const moved = resident({ line_items: [...LINES, { id: 4, quantity: 1, total: '10.00' }] });
		expect(tillAggregateFor({ line_items: LINES }, moved)).toBeNull();
	});

	it('checks EVERY line array the push carries, not just line_items', () => {
		const withFee = resident({ fee_lines: [{ id: 9, total: '3.00' }] });
		expect(
			tillAggregateFor({ line_items: LINES, fee_lines: [{ id: 9, total: '5.00' }] }, withFee)
		).toBeNull();
		expect(
			tillAggregateFor({ line_items: LINES, fee_lines: [{ id: 9, total: '3.00' }] }, withFee)
		).toEqual(AGGREGATE);
	});

	it('declines a push that carries no lines at all', () => {
		// WooCommerce only recalculates when the request carries items, so the ack
		// echoes stored money answering an OLDER write — comparing it would report
		// a divergence that never happened.
		expect(tillAggregateFor({ status: 'completed' }, resident())).toBeNull();
		expect(tillAggregateFor({ customer_note: 'ring twice' }, resident())).toBeNull();
	});

	it('declines when the resident holds no aggregate yet', () => {
		expect(tillAggregateFor({ line_items: LINES }, { line_items: LINES })).toBeNull();
	});

	it('carries only the fields the resident actually has', () => {
		const partial = { line_items: LINES, total: '36.68' };
		expect(tillAggregateFor({ line_items: LINES }, partial)).toEqual({ total: '36.68' });
	});
});
