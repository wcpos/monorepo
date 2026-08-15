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
		'settleCart',
		'snapshotFromOrderJSON',
	]);
});
