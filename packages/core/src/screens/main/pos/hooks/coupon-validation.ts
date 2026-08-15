/**
 * MIGRATION SHIM: validation moved to @wcpos/order-math with typed rejections.
 * This wrapper reproduces the legacy string interface until the PR 2 cutover.
 * The pure function takes an explicit clock (context.now); legacy callers do
 * not pass one, so the shim injects Date.now() to keep PR 1 behavior identical.
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
