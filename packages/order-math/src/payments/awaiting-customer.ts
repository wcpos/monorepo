/**
 * The awaiting-customer stamp (contract 1.2 §3.2): Free writes it on a `sent` outcome so a
 * projection never drags the order back to pos-open while the customer still holds the link.
 */

import type { MetaDataEntry } from './ledger';

export const AWAITING_CUSTOMER_META_KEY = '_wcpos_awaiting_customer';

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
	const entry = metaData?.find(({ key }) => key === AWAITING_CUSTOMER_META_KEY);
	let value: unknown = entry?.value;
	if (typeof value === 'string') {
		try {
			value = JSON.parse(value) as unknown;
		} catch {
			return null;
		}
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
	const stamp = value as Record<string, unknown>;
	if (typeof stamp.method_id !== 'string' || typeof stamp.attempt_id !== 'string') return null;
	return {
		method_id: stamp.method_id,
		destination: typeof stamp.destination === 'string' ? stamp.destination : null,
		attempt_id: stamp.attempt_id,
		sent_at_gmt: typeof stamp.sent_at_gmt === 'string' ? stamp.sent_at_gmt : '',
		cashier_id: typeof stamp.cashier_id === 'number' ? stamp.cashier_id : 0,
	};
}

/** The stamp as the order document carries it; `null` removes it (a cancelled invoice). */
export function withAwaitingCustomer(
	metaData: readonly MetaDataEntry[] | null | undefined,
	stamp: AwaitingCustomerStamp | null
): MetaDataEntry[] {
	const result = (metaData ?? []).filter(({ key }) => key !== AWAITING_CUSTOMER_META_KEY);
	if (stamp) result.push({ key: AWAITING_CUSTOMER_META_KEY, value: stamp });
	return result;
}
