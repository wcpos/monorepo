import {
	derive,
	getNetPaymentTotal,
	readLedger,
	settlementPatch,
	toMinor,
} from '@wcpos/order-math';

import type { OrderPayload } from './cart-config-for-order';

export type BoundaryResult = Parameters<typeof settlementPatch>[0];

export function netPaidForBoundary(payload: OrderPayload, dp: number) {
	const rows = readLedger(payload.meta_data);
	const paid = derive(payload.total, rows, [], { dp }).paid;
	return getNetPaymentTotal(
		paid,
		rows
			.filter((row) => ['authorized', 'captured'].includes(row.status))
			.map((row) => ({ amount: row.refunded_amount }))
	);
}

export function crossesPaidBalanceBoundary({
	payload,
	result,
	dp,
}: {
	payload: OrderPayload;
	result: BoundaryResult;
	dp: number;
}): boolean {
	// Checkout may have received the aggregate without completion; covered partials still need it.
	const netPaid = toMinor(netPaidForBoundary(payload, dp), dp);
	return (
		payload.status === 'pos-partial' &&
		(result.changed || toMinor(payload.total, dp) <= netPaid) &&
		toMinor(settlementPatch(result).total, dp) <= netPaid
	);
}
