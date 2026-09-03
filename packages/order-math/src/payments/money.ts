/**
 * Payments use fixed-decimal major-unit strings on the wire, unlike order-math MoneyString.
 */

import { roundHalfUp } from '../internal/money/precision';

export type PaymentMoney = string;

export function toMinor(value: string | number | null | undefined, dp: number): number {
	if (value === null || value === undefined || value === '') return 0;
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return 0;
	return Math.round(roundHalfUp(numeric, dp) * 10 ** dp);
}

export function fromMinor(minor: number, dp: number): PaymentMoney {
	return (minor / 10 ** dp).toFixed(dp);
}
