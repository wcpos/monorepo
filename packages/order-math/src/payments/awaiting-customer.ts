/**
 * The awaiting-customer stamp (contract 1.2 §3.2): Free writes it on a `sent` outcome so a
 * projection never drags the order back to pos-open while the customer still holds the link.
 */

import { attemptEntries, readGatewayAttempts, withGatewayAttempt } from './gateway-attempts';
import { type MetaDataEntry, readLedger, samePaymentId } from './ledger';

export interface AwaitingCustomerStamp {
	method_id: string;
	destination: string | null;
	attempt_id: string;
	sent_at_gmt: string;
	cashier_id: number;
}

export function readAwaitingCustomer(
	metaData: readonly MetaDataEntry[] | null | undefined
): AwaitingCustomerStamp | null {
	const attempt = readGatewayAttempts(metaData).awaiting;
	if (!attempt?.awaiting) return null;
	return {
		method_id: attempt.methodId,
		destination: attempt.awaiting.destination,
		attempt_id: attempt.id,
		sent_at_gmt: attempt.awaiting.atGmt ?? '',
		cashier_id: attempt.cashierId,
	};
}

/**
 * The stamp the till may act on. The store clears it the moment a counting row lands, so a
 * stamp beside held money is a copy that has not caught up yet; and while a terminal leg is
 * pending the order is being paid another way. Every surface reads it through here so the
 * tender pane, the ledger, the tab chips and Orders agree.
 */
export function activeAwaitingCustomer(
	metaData: readonly MetaDataEntry[] | null | undefined
): AwaitingCustomerStamp | null {
	const stamp = readAwaitingCustomer(metaData);
	if (!stamp) return null;
	const live = readLedger(metaData).some(({ status }) =>
		['pending', 'authorized', 'captured'].includes(status)
	);
	return live ? null : stamp;
}

/** Until the next adoption: the stamp's attempt alone awaits the customer; `null` clears all. */
export function withAwaitingCustomer(
	metaData: readonly MetaDataEntry[] | null | undefined,
	stamp: AwaitingCustomerStamp | null
): MetaDataEntry[] {
	const entries = attemptEntries(metaData) ?? [];
	const mine = (id: string) => !!stamp && samePaymentId(id, stamp.attempt_id);
	let result = [...(metaData ?? [])];
	for (const [id, entry] of entries)
		if (entry.awaiting != null && !mine(id))
			result = withGatewayAttempt(result, id, { awaiting: null });
	if (!stamp) return result;
	const { method_id, cashier_id, sent_at_gmt } = stamp;
	const awaiting = { destination: stamp.destination, at_gmt: sent_at_gmt };
	const known = entries.find(([id]) => mine(id))?.[0];
	const fresh = known ? {} : { fate: 'sent', method_id, cashier_id, sent_at_gmt };
	return withGatewayAttempt(result, known ?? stamp.attempt_id, { ...fresh, awaiting });
}
