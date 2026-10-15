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

/**
 * The replay inputs for the cart's active codes. `requiredCodes` (default: the
 * active codes) is the presence gate — settle also requires its candidates to
 * be in the context — but configs are built for the active codes only: a
 * candidate is validated, never replayed.
 */
export function resolveCouponReplay(
	coupons: CouponContext,
	activeCodes: readonly string[],
	requiredCodes: readonly string[] = activeCodes
):
	| {
			ok: true;
			couponConfigs: Map<string, CouponDiscountConfig>;
			productCategories: Map<number, { id: number }[]>;
	  }
	| { ok: false; missingCodes: readonly string[] } {
	const missingCodes = requiredCodes.filter((code) => !coupons.coupons.has(code));
	if (missingCodes.length > 0) return { ok: false, missingCodes };
	return {
		ok: true,
		couponConfigs: toCouponConfigs(activeCodes, coupons.coupons),
		productCategories: enrichedCategories(coupons),
	};
}

/** A validation context without the clock; its individual-use list is always present. */
export type CouponValidationContextDraft = Omit<
	CouponValidationContext,
	'now' | 'appliedCouponsWithIndividualUse'
> & { appliedCouponsWithIndividualUse: string[] };

export function couponValidationContext(args: {
	lineItems: readonly LineItemInput[];
	appliedCouponLines: readonly (CouponLineInput & { code: string })[];
	billing?: { email?: string | null };
	customer_id?: number | null;
	coupons: CouponContext;
	/** Ancestor-enriched categories already built (by `resolveCouponReplay`); built here when absent. */
	productCategories?: ReadonlyMap<number, { id: number }[]>;
}): CouponValidationContextDraft {
	const { lineItems, appliedCouponLines, billing, customer_id, coupons } = args;
	const categories = args.productCategories ?? enrichedCategories(coupons);
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
