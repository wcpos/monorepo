/**
 * MIGRATION SHIM: validation moved to @wcpos/order-math with typed rejections.
 * This wrapper reproduces the legacy string interface until the PR 2 cutover.
 */
import { validateCoupon as pureValidate } from '@wcpos/order-math/internal';

import { rejectionToEnglish } from './coupon-rejection-strings';

export type { CouponValidationContext } from '@wcpos/order-math/internal';

export interface ValidationResult {
	valid: boolean;
	error?: string;
}

export const validateCoupon = (...args: Parameters<typeof pureValidate>): ValidationResult => {
	const result = pureValidate(...args);
	if (result.valid) return { valid: true as const };
	return { valid: false as const, error: rejectionToEnglish(result.rejection) };
};
