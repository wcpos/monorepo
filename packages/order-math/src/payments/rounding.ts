import { toMinor } from './money';

import type { PaymentMethodDescriptor } from './types';

export type PaymentRounding = PaymentMethodDescriptor['defaults']['rounding'];

/**
 * Round integer minor units to a multiple of `incrementMinor` (#66, #84). `nearest` is half-up;
 * an increment of one minor unit or less rounds nothing.
 */
export function roundToIncrement(
	minor: number,
	incrementMinor: number,
	mode: NonNullable<PaymentRounding>['mode']
): number {
	if (incrementMinor <= 1) return minor;
	const remainder = minor % incrementMinor;
	if (remainder === 0) return minor;
	const down = minor - remainder;
	if (mode === 'down') return down;
	if (mode === 'up') return down + incrementMinor;
	return remainder * 2 >= incrementMinor ? down + incrementMinor : down;
}

/**
 * What a cash tender is due for a balance under the method's rounding, and the difference the
 * rounding fee line records (`dueMinor - balanceMinor`). No rounding is the identity.
 */
export function roundedDue(
	balanceMinor: number,
	rounding: PaymentRounding,
	dp: number
): { dueMinor: number; roundingMinor: number } {
	if (!rounding) return { dueMinor: balanceMinor, roundingMinor: 0 };
	const dueMinor = roundToIncrement(balanceMinor, toMinor(rounding.increment, dp), rounding.mode);
	return { dueMinor, roundingMinor: dueMinor - balanceMinor };
}
