/**
 * Boundary adapter for coupon validation. One job now: injecting the clock.
 *
 * The pure validator takes an explicit `context.now`; core callers do not have
 * one to give.
 *
 * It used to have a second job — flattening the typed `CouponRejection` to a
 * display string — and that was a known defect rather than a design, because
 * the string it produced was hardcoded English that reached the cashier
 * untranslated. The rejection now travels as `{ code, params }` all the way to
 * the hook that renders it, where `useCouponRejectionMessage` maps it to a
 * translation key (#1472). Nothing between here and there needs the sentence,
 * so nothing between here and there builds one.
 */
import { validateCoupon as pureValidate } from '@wcpos/order-math/internal';
import type {
	CouponRejection,
	CouponValidationContext as PureCouponValidationContext,
} from '@wcpos/order-math/internal';

/** Legacy context shape — the pure context minus the explicit clock (injected below). */
export type CouponValidationContext = Omit<PureCouponValidationContext, 'now'>;

export type ValidationResult = { valid: true } | { valid: false; rejection: CouponRejection };

export const validateCoupon = (
	coupon: Parameters<typeof pureValidate>[0],
	context: CouponValidationContext
): ValidationResult => {
	const result = pureValidate(coupon, { ...context, now: Date.now() });
	if (result.valid) return { valid: true as const };
	return { valid: false as const, rejection: result.rejection };
};
