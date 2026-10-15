import { isGuestCustomer } from '@wcpos/sync-core';

import { type CouponLineItem, enrichCategoriesWithAncestors } from './helpers';
import { isLineItemOnSale } from './recalculate';
import { toCouponConfigs } from './to-coupon-configs';

import type { CouponDiscountConfig } from './discount';
import type { CouponValidationContext } from './validate';
import type { CouponContext, CouponLineInput, LineItemInput } from '../../types';

function enrichedCategories(coupons: CouponContext): Map<number, { id: number }[]> {
	return enrichCategoriesWithAncestors(
		new Map([...coupons.productCategories].map(([id, categories]) => [id, [...categories]])),
		new Map(coupons.categoryParents ?? [])
	);
}

export function resolveCouponReplay(
	coupons: CouponContext,
	activeCodes: readonly string[]
):
	| {
			ok: true;
			couponConfigs: Map<string, CouponDiscountConfig>;
			productCategories: Map<number, { id: number }[]>;
	  }
	| { ok: false; missingCodes: readonly string[] } {
	const missingCodes = activeCodes.filter((code) => !coupons.coupons.has(code));
	if (missingCodes.length > 0) return { ok: false, missingCodes };
	return {
		ok: true,
		couponConfigs: toCouponConfigs(activeCodes, coupons.coupons),
		productCategories: enrichedCategories(coupons),
	};
}

export function couponValidationContext(args: {
	lineItems: readonly LineItemInput[];
	appliedCouponLines: readonly (CouponLineInput & { code: string })[];
	billing?: { email?: string | null };
	customer_id?: number | null;
	coupons: CouponContext;
}): Omit<CouponValidationContext, 'now'> {
	const { lineItems, appliedCouponLines, billing, customer_id, coupons } = args;
	const categories = enrichedCategories(coupons);
	const validationLines: CouponLineItem[] = lineItems.map((item) => {
		const qty = item.quantity || 1;
		return {
			product_id: item.product_id!,
			quantity: qty,
			price: parseFloat(item.total || '0') / qty,
			subtotal: item.subtotal || '0',
			total: item.total || '0',
			categories: categories.get(item.product_id!) || [],
			on_sale: isLineItemOnSale(item),
		};
	});

	const cartSubtotal = lineItems.reduce((sum, item) => sum + parseFloat(item.subtotal || '0'), 0);

	const appliedCoupons = appliedCouponLines.map((cl) => cl.code);
	const appliedCouponsWithIndividualUse: string[] = [];
	for (const cl of appliedCouponLines) {
		const applied = coupons.coupons.get(cl.code.toLowerCase());
		if (applied?.individual_use && cl.code) {
			appliedCouponsWithIndividualUse.push(cl.code);
		}
	}

	return {
		lineItems: validationLines,
		appliedCoupons,
		appliedCouponsWithIndividualUse,
		cartSubtotal,
		// Guest usage is checked by email, not customer ID.
		customerEmail: billing?.email || '',
		customerId: customer_id == null || isGuestCustomer(customer_id) ? null : customer_id,
	};
}
