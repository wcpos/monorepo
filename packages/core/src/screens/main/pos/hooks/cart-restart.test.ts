import { LEDGER_META_KEY } from '@wcpos/order-math';

import { cartRestartsOnAdd } from './cart-restart';

const open = (extra: Record<string, unknown> = {}) => ({ status: 'pos-open', ...extra });

it('an open cart with no lines restarts', () => {
	expect(cartRestartsOnAdd(open())).toBe(true);
	expect(cartRestartsOnAdd(open({ line_items: [], fee_lines: [], shipping_lines: [] }))).toBe(true);
});

it('a tombstoned line counts as removed; a live one keeps the cart', () => {
	expect(cartRestartsOnAdd(open({ line_items: [{ id: 3, product_id: null }] }))).toBe(true);
	expect(cartRestartsOnAdd(open({ line_items: [{ product_id: 41 }] }))).toBe(false);
	expect(cartRestartsOnAdd(open({ fee_lines: [{ id: 4, name: null }] }))).toBe(true);
	expect(cartRestartsOnAdd(open({ fee_lines: [{ name: 'Gift wrap' }] }))).toBe(false);
	expect(cartRestartsOnAdd(open({ shipping_lines: [{ id: 5, method_id: null }] }))).toBe(true);
	expect(cartRestartsOnAdd(open({ shipping_lines: [{ method_id: 'flat_rate' }] }))).toBe(false);
});

it('a coupon or a note alone does not keep a cart alive', () => {
	expect(
		cartRestartsOnAdd(open({ coupon_lines: [{ code: 'TEN' }], customer_note: 'ring twice' }))
	).toBe(true);
});

it('only an unpaid pos-open cart restarts', () => {
	expect(cartRestartsOnAdd({ status: 'pos-partial' })).toBe(false);
	expect(cartRestartsOnAdd({ status: 'pending' })).toBe(false);
	expect(cartRestartsOnAdd(open({ date_paid_gmt: '2026-10-12T09:00:00' }))).toBe(false);
	expect(
		cartRestartsOnAdd(
			open({
				meta_data: [
					{
						key: LEDGER_META_KEY,
						value: JSON.stringify({
							schema: 1,
							payments: [{ id: 'p1', amount: '5', method: 'cash', status: 'succeeded' }],
						}),
					},
				],
			})
		)
	).toBe(false);
});
