import { type CouponLineItem, getEligibleItems } from './helpers';

export interface CouponValidationContext {
	lineItems: CouponLineItem[];
	appliedCoupons: string[];
	appliedCouponsWithIndividualUse?: string[];
	cartSubtotal: number;
	customerEmail: string;
	customerId: number | null;
}

export type CouponRejectionCode =
	| 'already_applied'
	| 'expired'
	| 'usage_limit_reached'
	| 'usage_limit_reached_for_customer'
	| 'minimum_spend_not_met'
	| 'maximum_spend_exceeded'
	| 'individual_use'
	| 'individual_use_conflict'
	| 'email_required'
	| 'email_not_allowed'
	| 'not_applicable_to_cart';

export interface CouponRejection {
	code: CouponRejectionCode;
	params?: Readonly<Record<string, string | number>>;
}

export type ValidationResult = { valid: true } | { valid: false; rejection: CouponRejection };

/**
 * WooCommerce sends _gmt fields as bare ISO strings without a Z suffix.
 * JavaScript's Date constructor parses those as local time, which is wrong.
 */
function parseGmtDate(dateStr: string): Date {
	if (!/Z|[+-]\d{2}:\d{2}$/.test(dateStr)) {
		return new Date(dateStr + 'Z');
	}
	return new Date(dateStr);
}

/**
 * Client-side coupon validation that mirrors WooCommerce's coupon checks.
 *
 * Validates expiry, usage limits, minimum/maximum spend, individual-use rules,
 * email restrictions, and product/category eligibility.
 */
export function validateCoupon(coupon: any, context: CouponValidationContext): ValidationResult {
	// 1. Already applied check (case-insensitive, since codes are stored lowercase)
	const codeLower = coupon.code?.toLowerCase();
	if (context.appliedCoupons.some((c: string) => c.toLowerCase() === codeLower)) {
		return { valid: false, rejection: { code: 'already_applied' } };
	}

	// 2. Expiry check — parse as UTC since the field is _gmt
	if (coupon.date_expires_gmt) {
		const expiry = parseGmtDate(coupon.date_expires_gmt);
		if (expiry.getTime() < Date.now()) {
			return { valid: false, rejection: { code: 'expired' } };
		}
	}

	// 3. Usage limit
	if (
		coupon.usage_limit !== null &&
		coupon.usage_limit > 0 &&
		coupon.usage_count >= coupon.usage_limit
	) {
		return { valid: false, rejection: { code: 'usage_limit_reached' } };
	}

	// 4. Per-user usage limit
	if (
		coupon.usage_limit_per_user !== null &&
		coupon.usage_limit_per_user > 0 &&
		(context.customerId !== null || context.customerEmail)
	) {
		const identifier =
			context.customerId !== null
				? String(context.customerId)
				: context.customerEmail.toLowerCase();
		const userUsageCount = (coupon.used_by || []).filter(
			(id: string | number) => String(id).toLowerCase() === identifier
		).length;
		if (userUsageCount >= coupon.usage_limit_per_user) {
			return { valid: false, rejection: { code: 'usage_limit_reached_for_customer' } };
		}
	}

	// 5. Minimum amount
	if (coupon.minimum_amount && parseFloat(coupon.minimum_amount) > 0) {
		if (context.cartSubtotal < parseFloat(coupon.minimum_amount)) {
			return {
				valid: false,
				rejection: { code: 'minimum_spend_not_met', params: { amount: coupon.minimum_amount } },
			};
		}
	}

	// 6. Maximum amount
	if (coupon.maximum_amount && parseFloat(coupon.maximum_amount) > 0) {
		if (context.cartSubtotal > parseFloat(coupon.maximum_amount)) {
			return {
				valid: false,
				rejection: { code: 'maximum_spend_exceeded', params: { amount: coupon.maximum_amount } },
			};
		}
	}

	// 7a. Individual use — new coupon has individual_use and others already applied
	if (coupon.individual_use && context.appliedCoupons.length > 0) {
		return {
			valid: false,
			rejection: { code: 'individual_use', params: { code: coupon.code } },
		};
	}

	// 7b. Individual use — an already-applied coupon has individual_use
	if (
		context.appliedCouponsWithIndividualUse &&
		context.appliedCouponsWithIndividualUse.length > 0
	) {
		return {
			valid: false,
			rejection: {
				code: 'individual_use_conflict',
				params: { code: context.appliedCouponsWithIndividualUse[0] },
			},
		};
	}

	// 8. Email restrictions
	if (coupon.email_restrictions && coupon.email_restrictions.length > 0) {
		if (!context.customerEmail) {
			return { valid: false, rejection: { code: 'email_required' } };
		}
		const emailLower = context.customerEmail.toLowerCase();
		const matches = coupon.email_restrictions.some((pattern: string) => {
			const patternLower = pattern.toLowerCase().trim();
			if (patternLower.includes('*')) {
				// Escape regex special characters, then convert \* back to .*
				const regex = new RegExp(
					'^' + patternLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$'
				);
				return regex.test(emailLower);
			}
			return emailLower === patternLower;
		});
		if (!matches) {
			return { valid: false, rejection: { code: 'email_not_allowed' } };
		}
	}

	// 9. Product/category restrictions — check that at least one item is eligible
	const eligible = getEligibleItems(context.lineItems, {
		product_ids: coupon.product_ids || [],
		excluded_product_ids: coupon.excluded_product_ids || [],
		product_categories: coupon.product_categories || [],
		excluded_product_categories: coupon.excluded_product_categories || [],
		exclude_sale_items: coupon.exclude_sale_items || false,
	});

	const hasRestrictions =
		coupon.product_ids?.length > 0 ||
		coupon.excluded_product_ids?.length > 0 ||
		coupon.product_categories?.length > 0 ||
		coupon.excluded_product_categories?.length > 0 ||
		coupon.exclude_sale_items;

	if (hasRestrictions && eligible.length === 0) {
		return { valid: false, rejection: { code: 'not_applicable_to_cart' } };
	}

	// 9b. WooCommerce: fixed_cart + exclude_sale_items rejects the entire coupon
	// when ANY sale item is in the cart, even if non-sale items exist.
	if (
		coupon.discount_type === 'fixed_cart' &&
		coupon.exclude_sale_items &&
		context.lineItems.some((item) => item.on_sale)
	) {
		return { valid: false, rejection: { code: 'not_applicable_to_cart' } };
	}

	return { valid: true };
}
