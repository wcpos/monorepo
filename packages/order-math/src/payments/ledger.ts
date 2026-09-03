/**
 * Ledger helpers preserve the typed-meta wire shape while keeping all updates immutable.
 */

import { fromMinor, toMinor } from './money';

import type { PaymentMethodDescriptor, PaymentRow } from './types';

export const LEDGER_META_KEY = '_wcpos_payments';
export const LEDGER_SCHEMA = 1;

/** One `meta_data` entry as the order document carries it (`key` is optional there). */
export type MetaDataEntry = {
	id?: number;
	key?: string;
	value?: unknown;
	[k: string]: unknown;
};

function parseLedger(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
}

export function readLedger(metaData: readonly MetaDataEntry[] | null | undefined): PaymentRow[] {
	const entry = metaData?.find(({ key }) => key === LEDGER_META_KEY);
	const ledger = parseLedger(entry?.value);
	if (typeof ledger !== 'object' || ledger === null) return [];
	const candidate = ledger as Record<string, unknown>;
	if (candidate.schema !== LEDGER_SCHEMA || !Array.isArray(candidate.payments)) return [];
	// A fresh array of object rows: callers never hold a reference into the (possibly
	// frozen RxDB) document, and a row without an identity cannot reach derive/upsert.
	return candidate.payments.filter(
		(row): row is PaymentRow =>
			typeof row === 'object' &&
			row !== null &&
			!Array.isArray(row) &&
			typeof (row as { id?: unknown }).id === 'string'
	);
}

export function withLedger(
	metaData: readonly MetaDataEntry[] | null | undefined,
	rows: readonly PaymentRow[]
): MetaDataEntry[] {
	const result = [...(metaData ?? [])];
	const index = result.findIndex(({ key }) => key === LEDGER_META_KEY);
	const value = { schema: LEDGER_SCHEMA, payments: [...rows] };
	if (index === -1) result.push({ key: LEDGER_META_KEY, value });
	else result[index] = { ...result[index], key: LEDGER_META_KEY, value };
	return result;
}

export function upsertPaymentRow(rows: readonly PaymentRow[], row: PaymentRow): PaymentRow[] {
	const result = [...rows];
	const id = row.id.toLowerCase();
	const index = result.findIndex((existing) => existing.id.toLowerCase() === id);
	if (index === -1) result.push(row);
	else result[index] = row;
	return result;
}

export interface MintManualPaymentInput {
	method: PaymentMethodDescriptor;
	amount: string | number;
	tendered?: string | number | null;
	currency: string;
	orderId: number | null;
	cashierId: number;
	storeId: number | null;
	recordedOffline: boolean;
	now: () => string;
	uuid: () => string;
	dp?: number;
}

export type MintManualPaymentResult =
	| { ok: true; row: PaymentRow }
	| {
			ok: false;
			reason:
				'not_manual' | 'amount_not_positive' | 'tendered_not_allowed' | 'tendered_below_amount';
	  };

export function mintManualPayment(input: MintManualPaymentInput): MintManualPaymentResult {
	if (input.method.capture.mode !== 'manual') return { ok: false, reason: 'not_manual' };
	const dp = input.dp ?? 2;
	const amount = toMinor(input.amount, dp);
	if (amount <= 0) return { ok: false, reason: 'amount_not_positive' };
	const hasTendered = input.tendered !== null && input.tendered !== undefined;
	if (hasTendered && (input.method.kind !== 'cash' || !input.method.capabilities.change)) {
		return { ok: false, reason: 'tendered_not_allowed' };
	}
	const tendered = hasTendered ? toMinor(input.tendered, dp) : null;
	if (tendered !== null && tendered < amount) {
		return { ok: false, reason: 'tendered_below_amount' };
	}

	const timestamp = input.now();
	return {
		ok: true,
		row: {
			id: input.uuid().toLowerCase(),
			source: 'app',
			order_id: input.orderId ?? 0,
			method_id: input.method.id,
			provider: input.method.capture.provider,
			kind: input.method.kind,
			capture_mode: 'manual',
			transport: null,
			recorded_offline: input.recordedOffline,
			amount: fromMinor(amount, dp),
			currency: input.currency,
			tendered: tendered === null ? null : fromMinor(tendered, dp),
			change: tendered === null ? null : fromMinor(tendered - amount, dp),
			tip: null,
			status: 'captured',
			failure_reason: null,
			refunded_amount: fromMinor(0, dp),
			refunds: [],
			provider_refs: {},
			receipt: {},
			cashier_id: input.cashierId,
			store_id: input.storeId,
			created_at_gmt: timestamp,
			captured_at_gmt: timestamp,
			updated_at_gmt: timestamp,
		},
	};
}
