import * as api from './index';

test('public value surface is exactly the spec', () => {
	expect(
		Object.keys(api)
			.filter((k) => typeof (api as Record<string, unknown>)[k] === 'function')
			.sort()
	).toEqual([
		'calculateCartLine',
		'createCartConfig',
		'getNetPaymentTotal',
		'getOrderTotals',
		'isActiveCouponLine',
		'isActiveFeeLine',
		'isActiveLineItem',
		'isActiveShippingLine',
		// Added 2026-08-19: the POS cart footer displays refunds row-by-row and then
		// deducts a total. Without a shared rule for "what one refund is worth" the
		// rows and the deduction were computed differently and could disagree on
		// screen. One exported function is the smallest fix; see net-payment.test.ts.
		'refundValue',
		'settleCart',
		'snapshotFromOrderJSON',
	]);
});
