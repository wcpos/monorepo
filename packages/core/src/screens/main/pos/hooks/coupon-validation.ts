/**
 * Boundary adapter for coupon validation. Two jobs:
 *
 *   1. Injects the clock. The pure validator takes an explicit `context.now`;
 *      core callers do not have one to give.
 *   2. Flattens the typed `CouponRejection` to a display string.
 *
 * Job 2 is a known defect, not a design: `rejectionToEnglish` produces
 * hardcoded English that reaches the cashier untranslated (there are no `t()`
 * keys for the 11 rejection reasons). The typed `{ code, params }` needed to
 * fix it already exists upstream — mapping it to translation keys at the call
 * site, and deleting this flattening, is tracked in #1472.
 */
import { validateCoupon as pureValidate } from '@wcpos/order-math/internal';
import type { CouponValidationContext as PureCouponValidationContext } from '@wcpos/order-math/internal';

import { rejectionToEnglish } from './coupon-rejection-strings';

/** Legacy context shape — the pure context minus the explicit clock (injected below). */
export type CouponValidationContext = Omit<PureCouponValidationContext, 'now'>;

export interface ValidationResult {
	valid: boolean;
	error?: string;
}

export const validateCoupon = (
	coupon: Parameters<typeof pureValidate>[0],
	context: CouponValidationContext
): ValidationResult => {
	const result = pureValidate(coupon, { ...context, now: Date.now() });
	if (result.valid) return { valid: true as const };
	return { valid: false as const, error: rejectionToEnglish(result.rejection) };
};
