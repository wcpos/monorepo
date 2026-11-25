/**
 * Tender correction (#3647): the store appends R- (`reverses` the original) and R+ (`corrects`
 * it) instead of editing a captured row. These predicates mirror its refusal table, in order.
 */

import { partitionVoidableRows, reversedPaymentIds, samePaymentId } from './ledger';
import { toMinor } from './money';

import type { MetaDataEntry } from './ledger';
import type { PaymentMethodDescriptor, PaymentRow } from './types';

/** Whether the store would accept `correct` on `row`: every refusal reason fails it. */
export function isTenderCorrectable(
	row: PaymentRow,
	rows: readonly PaymentRow[],
	meta: readonly MetaDataEntry[] | null | undefined
): boolean {
	return (
		row.status === 'captured' &&
		!partitionVoidableRows(meta).voidable.some(({ id }) => samePaymentId(id, row.id)) &&
		!row.reverses &&
		!reversedPaymentIds(rows).has(row.id.toLowerCase()) &&
		!(Array.isArray(row.refunds) && row.refunds.length > 0) &&
		row.capture_mode === 'manual' &&
		row.source === 'app' &&
		!row.provider
	);
}

/** A corrected original's standing R+: the captured row that `corrects` it, with a captured R-. */
export function correctionOf(row: PaymentRow, rows: readonly PaymentRow[]): PaymentRow | null {
	if (!reversedPaymentIds(rows).has(row.id.toLowerCase())) return null;
	return (
		rows.find(
			({ status, corrects }) =>
				status === 'captured' && typeof corrects === 'string' && samePaymentId(corrects, row.id)
		) ?? null
	);
}

/**
 * The POS-enabled methods the store would accept as a target for `row` (#3651: any of them but a
 * stored-value one; `method_invalid`, `same_method`, `off_rounding_increment`). The amount is never
 * re-rounded: a target on a 0.05 increment is offered only when the amount is already a whole
 * multiple of it.
 */
export function tenderCorrectionTargets(
	row: PaymentRow,
	methods: readonly PaymentMethodDescriptor[],
	dp: number
): PaymentMethodDescriptor[] {
	const amountMinor = toMinor(row.amount, dp);
	return methods.filter((method) => {
		if (!method.pos_enabled || method.kind === 'stored_value') return false;
		if (method.id === row.method_id) return false;
		const increment = method.defaults?.rounding?.increment;
		if (!increment) return true;
		const incrementMinor = toMinor(increment, dp);
		return incrementMinor > 0 && amountMinor % incrementMinor === 0;
	});
}

/**
 * Whether the store records a correction to `method` as plain manual money (#3651): no provider and
 * a manual capture mode. Any other target's R+ carries `unverified: true`. The mode's own provider
 * is not looked at: that is the server's rule.
 */
export function isPlainManualMethod(method: PaymentMethodDescriptor): boolean {
	return !method.capture.provider && !!method.capture.modes?.some(({ mode }) => mode === 'manual');
}
