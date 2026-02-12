import { type CouponLineItem, getEligibleItems } from './coupon-helpers';

export interface CouponValidationContext {
	lineItems: CouponLineItem[];
	appliedCoupons: string[];
	cartSubtotal: number;
	customerEmail: string;
	customerId: number | null;
}

export interface ValidationResult {
	valid: boolean;
	error?: string;
}

/**
 * Client-side coupon validation that mirrors WooCommerce's coupon checks.
 *
 * Validates expiry, usage limits, minimum/maximum spend, individual-use rules,
 * email restrictions, and product/category eligibility.
 */
export function validateCoupon(coupon: any, context: CouponValidationContext): ValidationResult {
	// 1. Already applied check
	if (context.appliedCoupons.includes(coupon.code)) {
		return { valid: false, error: 'This coupon has already been applied.' };
	}

	// 2. Expiry check
	if (coupon.date_expires_gmt) {
		const expiry = new Date(coupon.date_expires_gmt);
		if (expiry.getTime() < Date.now()) {
			return { valid: false, error: 'This coupon has expired.' };
		}
	}

	// 3. Usage limit
	if (
		coupon.usage_limit !== null &&
		coupon.usage_limit > 0 &&
		coupon.usage_count >= coupon.usage_limit
	) {
		return { valid: false, error: 'Coupon usage limit has been reached.' };
	}

	// 4. Per-user usage limit
	if (
		coupon.usage_limit_per_user !== null &&
		coupon.usage_limit_per_user > 0 &&
		context.customerId !== null
	) {
		const userUsageCount = (coupon.used_by || []).filter(
			(id: string | number) => String(id) === String(context.customerId)
		).length;
		if (userUsageCount >= coupon.usage_limit_per_user) {
			return { valid: false, error: 'Coupon usage limit has been reached for this customer.' };
		}
	}

	// 5. Minimum amount
	if (coupon.minimum_amount && parseFloat(coupon.minimum_amount) > 0) {
		if (context.cartSubtotal < parseFloat(coupon.minimum_amount)) {
			return { valid: false, error: `Minimum spend of ${coupon.minimum_amount} not met.` };
		}
	}

	// 6. Maximum amount
	if (coupon.maximum_amount && parseFloat(coupon.maximum_amount) > 0) {
		if (context.cartSubtotal > parseFloat(coupon.maximum_amount)) {
			return { valid: false, error: `Maximum spend of ${coupon.maximum_amount} exceeded.` };
		}
	}

	// 7. Individual use
	if (coupon.individual_use && context.appliedCoupons.length > 0) {
		return { valid: false, error: 'This coupon cannot be used with other coupons.' };
	}

	// 8. Email restrictions
	if (coupon.email_restrictions && coupon.email_restrictions.length > 0 && context.customerEmail) {
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
			return { valid: false, error: 'This coupon is not valid for your email address.' };
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
		return { valid: false, error: 'This coupon is not applicable to items in your cart.' };
	}

	return { valid: true };
}
