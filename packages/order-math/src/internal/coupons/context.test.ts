import { isLineItemOnSale, recalculateCoupons } from './recalculate';
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

it('replay configs are built from applied codes, not candidates', () => {
	const withCandidate: CouponContext = {
		...coupons,
		coupons: new Map([
			...coupons.coupons,
			['bonus', { code: 'bonus', discount_type: 'fixed_cart', amount: '5' }],
		]),
	};
	const result = resolveCouponReplay(withCandidate, ['solo'], ['solo', 'bonus']);
	expect(result.ok).toBe(true);
	if (!result.ok) throw new Error('missing coupon');
	expect([...result.couponConfigs.keys()]).toEqual(['solo']);
	expect(resolveCouponReplay(withCandidate, ['solo'], ['solo', 'gone'])).toEqual({
		ok: false,
		missingCodes: ['gone'],
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

it('non-finite POS prices are not on sale in validation or replay', () => {
	for (const [price, regular_price] of [
		['18', 'Infinity'],
		['-Infinity', '20'],
		['NaN', '20'],
		['18', 'NaN'],
	]) {
		const line = {
			product_id: 82,
			quantity: 1,
			subtotal: '18',
			total: '18',
			meta_data: [
				{ key: '_woocommerce_pos_data', value: JSON.stringify({ price, regular_price }) },
			],
		};
		expect(isLineItemOnSale(line)).toBe(false);
		expect(
			couponValidationContext({ lineItems: [line], appliedCouponLines: [], coupons }).lineItems[0]
				.on_sale
		).toBe(false);
	}
	const result = recalculateCoupons({
		lineItems: [
			{
				product_id: 82,
				quantity: 1,
				subtotal: '18',
				total: '18',
				meta_data: [
					{
						key: '_woocommerce_pos_data',
						value: JSON.stringify({ price: '18', regular_price: 'Infinity' }),
					},
				],
			},
		],
		couponLines: [{ code: 'sale-excluded' }],
		couponConfigs: new Map([
			[
				'sale-excluded',
				{
					discount_type: 'percent',
					amount: '10',
					exclude_sale_items: true,
					limit_usage_to_x_items: null,
					product_ids: [],
					excluded_product_ids: [],
					product_categories: [],
					excluded_product_categories: [],
				},
			],
		]),
		pricesIncludeTax: false,
		calcDiscountsSequentially: false,
		taxRates: [],
		productCategories: new Map(),
		taxRoundAtSubtotal: false,
		dp: 2,
	});
	expect(result.couponLines[0].discount).toBe('1.8');
});
