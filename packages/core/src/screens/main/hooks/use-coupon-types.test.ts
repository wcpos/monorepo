import { storeCalculatedCouponTypes } from './use-coupon-types';

const credit = { type: 'acme_credit', calc: 'store', offline: 'none' };

it.each([
	null,
	undefined,
	'invalid',
	{},
	{ schema: 1 },
	{ schema: 1, coupon_types: {} },
	{ schema: 2, coupon_types: [credit] },
	{ schema: '1', coupon_types: [credit] },
])('admits nothing from a missing or bad declaration: %j', (value) => {
	expect(storeCalculatedCouponTypes(value)).toEqual(new Set());
});

it('admits nothing from a declaration with an empty list', () => {
	expect(storeCalculatedCouponTypes({ schema: 1, coupon_types: [] }).size).toBe(0);
});

it('admits only non-core store-calculated types with offline none', () => {
	const coupon_types = [
		null,
		'invalid',
		{},
		...['percent', 'fixed_cart', 'fixed_product', '', 42, null].map((type) => ({
			...credit,
			type,
		})),
		{ ...credit, type: 'wrong_calc', calc: 'other' },
		{ ...credit, type: 'wrong_offline', offline: 'other' },
		{ type: 'no_offline', calc: 'store' },
		{ type: 'no_calc', offline: 'none' },
		credit,
		{ ...credit, type: 'second', provider: null, label: 42, balance: false },
	];
	expect(storeCalculatedCouponTypes({ schema: 1, coupon_types })).toEqual(
		new Set(['acme_credit', 'second'])
	);
});
