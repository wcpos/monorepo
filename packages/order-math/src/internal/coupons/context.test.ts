import { couponValidationContext, resolveCouponReplay } from './context';

import type { CouponContext } from '../../types';

const coupons: CouponContext = {
	coupons: new Map([
		['solo', { code: 'Solo', discount_type: 'percent', amount: '', individual_use: true }],
	]),
	productCategories: new Map([[82, [{ id: 17 }]]]),
	categoryParents: new Map([[17, 16]]),
};

it('resolveCouponReplay reports every missing active code', () => {
	expect(resolveCouponReplay(coupons, ['solo', 'missing', 'other'])).toEqual({
		ok: false,
		missingCodes: ['missing', 'other'],
	});
});

it('resolveCouponReplay applies toCouponConfigs defaults', () => {
	const result = resolveCouponReplay(coupons, ['solo']);
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error('missing coupon');
	expect(result.couponConfigs.get('solo')).toEqual({
		discount_type: 'percent',
		amount: '0',
		limit_usage_to_x_items: null,
		product_ids: [],
		excluded_product_ids: [],
		product_categories: [],
		excluded_product_categories: [],
		exclude_sale_items: false,
	});
});

it('resolveCouponReplay enriches with ancestors', () => {
	const result = resolveCouponReplay(coupons, []);
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error('missing coupon');
	expect(result.productCategories.get(82)).toEqual([{ id: 17 }, { id: 16 }]);
	expect(coupons.productCategories.get(82)).toEqual([{ id: 17 }]);
});

it('couponValidationContext reverse individual_use matches case-insensitively', () => {
	const context = couponValidationContext({
		lineItems: [],
		appliedCouponLines: [{ code: 'sOlO' }],
		coupons,
	});
	expect(context.appliedCouponsWithIndividualUse).toEqual(['sOlO']);
});

it.each([0, null, undefined])(
	'couponValidationContext maps guest %s to null customerId',
	(customer_id) => {
		expect(
			couponValidationContext({
				lineItems: [],
				appliedCouponLines: [],
				coupons,
				customer_id,
			}).customerId
		).toBeNull();
	}
);
