import {
	isActiveCouponLine,
	isActiveFeeLine,
	isActiveLineItem,
	isActiveShippingLine,
	snapshotFromOrderJSON,
} from './snapshot';

test('picks only the engine-read fields', () => {
	const snap = snapshotFromOrderJSON({
		line_items: [{ product_id: 1 }],
		coupon_lines: [{ code: 'x' }],
		total: '10',
		cart_tax: '1',
		status: 'pos-open',
		billing: { email: 'a@b.c', first_name: 'Z' },
	} as never);
	expect(snap).toEqual({
		line_items: [{ product_id: 1 }],
		fee_lines: [],
		shipping_lines: [],
		coupon_lines: [{ code: 'x' }],
		billing: { email: 'a@b.c' },
		customer_id: undefined,
		discount_total: undefined,
		discount_tax: undefined,
		shipping_total: undefined,
		shipping_tax: undefined,
		cart_tax: '1',
		total: '10',
		total_tax: undefined,
		tax_lines: undefined,
	});
});
test('tombstone predicates match the four conventions', () => {
	expect(isActiveLineItem({ product_id: null })).toBe(false);
	expect(isActiveLineItem({ product_id: 0 })).toBe(true); // product_id 0 (misc product) is ACTIVE
	expect(isActiveFeeLine({ name: null })).toBe(false);
	expect(isActiveShippingLine({ method_id: null })).toBe(false);
	expect(isActiveCouponLine({ code: null })).toBe(false);
	expect(isActiveCouponLine({})).toBe(false); // loose != null: undefined is tombstone too
	expect(isActiveCouponLine({ code: 'x' })).toBe(true);
});
