import { fromMinor, toMinor } from './money';

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
 * rounding fee line records (`dueMinor - balanceMinor`). No rounding is the identity, and so is
 * an increment the store's decimals cannot hold (0.25 at one decimal would round to 0.3).
 */
export function roundedDue(
	balanceMinor: number,
	rounding: PaymentRounding,
	dp: number
): { dueMinor: number; roundingMinor: number } {
	const incrementMinor = rounding ? toMinor(rounding.increment, dp) : 0;
	if (!rounding || Number(fromMinor(incrementMinor, dp)) !== Number(rounding.increment))
		return { dueMinor: balanceMinor, roundingMinor: 0 };
	const dueMinor = roundToIncrement(balanceMinor, incrementMinor, rounding.mode);
	return { dueMinor, roundingMinor: dueMinor - balanceMinor };
}

/**
 * Whether a cash tender settles the sale at the rounded due: the leg reaches it (a round-down due
 * sits below the balance) and the notes handed over cover it (or the change would be negative).
 * The cash.rounding hook rewrites on this, and the tender pane previews with it.
 */
export function settlesAtRoundedDue(facts: {
	amountMinor: number;
	tenderedMinor: number;
	balanceMinor: number;
	dueMinor: number;
}): boolean {
	const { amountMinor, tenderedMinor, balanceMinor, dueMinor } = facts;
	return amountMinor >= Math.min(balanceMinor, dueMinor) && tenderedMinor >= dueMinor;
}
