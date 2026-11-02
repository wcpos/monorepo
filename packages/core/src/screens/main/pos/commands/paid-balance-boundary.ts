import {
	activeAwaitingCustomer,
	derive,
	getNetPaymentTotal,
	hasLiveSettlementLeg,
	readLedger,
	serverOwnsMoney,
	settlementPatch,
	toMinor,
} from '@wcpos/order-math';
import { OPEN_ORDER_STATUSES } from '@wcpos/query';

import type { CurrentOrderRecord } from '../contexts/current-order/context';
import type { OrderPayload } from './cart-config-for-order';

export type BoundaryResult = Parameters<typeof settlementPatch>[0];

export function netPaidForBoundary(payload: OrderPayload, dp: number) {
	const rows = readLedger(payload.meta_data);
	const paid = derive(payload.total, rows, [], { dp }).paid;
	return getNetPaymentTotal(
		paid,
		rows
			// ADR 0040 D6: captured money alone is paid; an authorization is only a hold.
			.filter((row) => row.status === 'captured')
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

export type OrderLockReaders = {
	serverOwnsMoney: (uuid: string) => boolean;
	orderSaveState: (uuid: string) => { kind: string } | null;
	inCheckout: (uuid: string) => boolean;
};
export function orderLocked(
	payload: OrderPayload,
	record: CurrentOrderRecord,
	deps: OrderLockReaders,
	dp: number,
	options: { ignoreCheckout?: boolean; allowNew?: boolean; allowDurableHint?: boolean } = {}
) {
	const netPaid = netPaidForBoundary(payload, dp);
	return Boolean(
		!OPEN_ORDER_STATUSES.some((status) => status === payload.status) ||
		(!options.allowNew && (record as { isNew?: boolean }).isNew) ||
		hasLiveSettlementLeg(payload.meta_data) ||
		activeAwaitingCustomer(payload.meta_data) ||
		(payload.status !== 'pos-partial' &&
			netPaid > 0 &&
			toMinor(payload.total, dp) <= toMinor(netPaid, dp)) ||
		['rejected', 'conflicted', 'needs-revision'].includes(
			deps.orderSaveState(record.uuid)?.kind ?? ''
		) ||
		(!options.ignoreCheckout && deps.inCheckout(record.uuid)) ||
		deps.serverOwnsMoney(record.uuid) ||
		(!options.allowDurableHint && serverOwnsMoney(payload.meta_data))
	);
}
