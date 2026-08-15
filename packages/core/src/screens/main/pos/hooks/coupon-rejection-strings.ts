/**
 * Maps typed CouponRejection codes back to the exact English strings that the
 * pre-move validator produced. Used by the legacy shim in coupon-validation.ts
 * so existing callers that surface `validation.error` keep working unchanged.
 *
 * Strings are taken verbatim from the original coupon-validation.ts — do NOT
 * paraphrase them or the core add-coupon tests (which pin the English strings)
 * will fail.
 */
import type { CouponRejection } from '@wcpos/order-math/internal';

export function rejectionToEnglish(rejection: CouponRejection): string {
	switch (rejection.code) {
		case 'already_applied':
			return 'This coupon has already been applied.';
		case 'expired':
			return 'This coupon has expired.';
		case 'usage_limit_reached':
			return 'Coupon usage limit has been reached.';
		case 'usage_limit_reached_for_customer':
			return 'Coupon usage limit has been reached for this customer.';
		case 'minimum_spend_not_met':
			return `Minimum spend of ${rejection.params?.amount} not met.`;
		case 'maximum_spend_exceeded':
			return `Maximum spend of ${rejection.params?.amount} exceeded.`;
		case 'individual_use':
			return 'This coupon cannot be used with other coupons.';
		case 'individual_use_conflict':
			return `Coupon "${rejection.params?.code}" cannot be used with other coupons.`;
		case 'email_required':
			return 'This coupon requires an email address.';
		case 'email_not_allowed':
			return 'This coupon is not valid for your email address.';
		case 'not_applicable_to_cart':
			return 'This coupon is not applicable to items in your cart.';
		default: {
			// Exhaustive check — TypeScript will flag unknown codes at compile time
			const _exhaustive: never = rejection.code;
			return `Unknown coupon validation error: ${_exhaustive}`;
		}
	}
}
