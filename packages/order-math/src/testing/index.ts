/**
 * @wcpos/order-math/testing — fixture builders for tests.
 * NOT intended for production use. No semver on this surface.
 */
import { type CartConfig, type CartConfigInput, createCartConfig } from '../config';

import type { CartSnapshot } from '../snapshot';
import type {
	CouponContext,
	CouponInput,
	CouponLineInput,
	FeeLineInput,
	LineItemInput,
	ShippingLineInput,
} from '../types';

export function makeCartConfig(overrides: Partial<CartConfigInput> = {}): CartConfig {
	return createCartConfig({
		rates: [],
		allRates: [],
		calcTaxes: true,
		pricesIncludeTax: false,
		taxRoundAtSubtotal: false,
		dp: 2,
		shippingTaxClass: '',
		calcDiscountsSequentially: false,
		...overrides,
	});
}

export function makeSnapshot(overrides: Partial<CartSnapshot> = {}): CartSnapshot {
	return {
		line_items: [],
		fee_lines: [],
		shipping_lines: [],
		coupon_lines: [],
		...overrides,
	};
}

export function makeCouponContext(
	args: {
		coupons?: readonly CouponInput[];
		productCategories?: ReadonlyMap<number, readonly { id: number }[]>;
		categoryParents?: ReadonlyMap<number, number>;
	} = {}
): CouponContext {
	return {
		coupons: new Map((args.coupons ?? []).map((c) => [c.code.toLowerCase(), c])),
		productCategories: args.productCategories ?? new Map(),
		categoryParents: args.categoryParents,
	};
}

export function makeLineItem(
	overrides: Partial<LineItemInput> & { posData?: Record<string, unknown> } = {}
): LineItemInput {
	const { posData, ...rest } = overrides;
	return {
		product_id: 1,
		quantity: 1,
		subtotal: '10',
		total: '10',
		subtotal_tax: '0',
		total_tax: '0',
		taxes: [],
		meta_data: [
			{ key: '_woocommerce_pos_uuid', value: 'test-uuid-1' },
			{
				key: '_woocommerce_pos_data',
				value: JSON.stringify({
					price: '10',
					regular_price: '10',
					tax_status: 'taxable',
					...posData,
				}),
			},
		],
		...rest,
	};
}

export function makeFeeLine(
	overrides: Partial<FeeLineInput> & { posData?: Record<string, unknown> } = {}
): FeeLineInput {
	const { posData, ...rest } = overrides;
	return {
		name: 'Fee',
		total: '5',
		total_tax: '0',
		taxes: [],
		meta_data: [
			{ key: '_woocommerce_pos_uuid', value: 'test-uuid-fee-1' },
			{
				key: '_woocommerce_pos_data',
				value: JSON.stringify({
					amount: 5,
					percent: false,
					tax_status: 'taxable',
					...posData,
				}),
			},
		],
		...rest,
	};
}

export function makeShippingLine(
	overrides: Partial<ShippingLineInput> & { posData?: Record<string, unknown> } = {}
): ShippingLineInput {
	const { posData, ...rest } = overrides;
	return {
		method_id: 'flat_rate',
		method_title: 'Flat rate',
		total: '5',
		total_tax: '0',
		taxes: [],
		meta_data: [
			{ key: '_woocommerce_pos_uuid', value: 'test-uuid-shipping-1' },
			{
				key: '_woocommerce_pos_data',
				value: JSON.stringify({
					amount: 5,
					tax_status: 'taxable',
					...posData,
				}),
			},
		],
		...rest,
	};
}

export function makeCouponLine(overrides: Partial<CouponLineInput> = {}): CouponLineInput {
	return {
		code: 'test-coupon',
		discount: '0',
		discount_tax: '0',
		meta_data: [{ key: '_woocommerce_pos_uuid', value: 'test-coupon-uuid-1' }],
		...overrides,
	};
}
