/**
 * Ledger helpers preserve the typed-meta wire shape while keeping all updates immutable.
 */

import { fromMinor, toMinor } from './money';
import { readCompletions } from './provenance';

import type { PaymentMethodDescriptor, PaymentRow, PaymentTransport } from './types';

export const LEDGER_META_KEY = '_wcpos_payments';
export const LEDGER_SCHEMA = 1;
// Keep aligned with POS_META_KEYS.paymentMethod in sync-core/src/pos-carrier/carrier.ts.
export const PAYMENT_METHOD_INDEX_META_KEY = '_wcpos_payment_method';
const LIVE_PAYMENT_STATUSES: readonly PaymentRow['status'][] = [
	'pending',
	'authorized',
	'captured',
];

export function isLivePaymentStatus(status: string): boolean {
	return (LIVE_PAYMENT_STATUSES as readonly string[]).includes(status);
}

/** Money settled locally, including authorizations recorded offline. */
// No device check on purpose: an `authorized && recorded_offline` row is a device authorization by
// construction, and the predicate stays narrow for the ledger's own summary.
export function isSettledPaymentRow(row: Pick<PaymentRow, 'status' | 'recorded_offline'>): boolean {
	return (
		row.status === 'captured' || (row.status === 'authorized' && row.recorded_offline === true)
	);
}

export function isFailedPaymentStatus(status: string): status is 'failed' | 'voided' {
	return status === 'failed' || status === 'voided';
}

export function isFinalPaymentStatus(status: string): status is 'captured' | 'failed' | 'voided' {
	return status === 'captured' || isFailedPaymentStatus(status);
}

/**
 * Money in motion: exactly pending | authorized. Row status only; the server's reopen gate also
 * counts gateway attempts that are `sent` and refund allocations that are `pending`.
 */
export function isInMotionPaymentStatus(status: string): status is 'pending' | 'authorized' {
	return status === 'pending' || status === 'authorized';
}

/**
 * A reader authorization taken offline that settles later (descriptor `offline: 'queue'`): the
 * Mango-selector form of the predicate `isOfflineDeviceAuthorization`.
 */
export const OFFLINE_DEVICE_AUTHORIZATION = Object.freeze({
	capture_mode: 'device',
	recorded_offline: true,
	status: 'authorized',
} as const);

export function isOfflineDeviceAuthorization(
	row: Pick<PaymentRow, 'capture_mode' | 'recorded_offline' | 'status'>
): boolean {
	return (
		row.capture_mode === OFFLINE_DEVICE_AUTHORIZATION.capture_mode &&
		row.recorded_offline === OFFLINE_DEVICE_AUTHORIZATION.recorded_offline &&
		row.status === OFFLINE_DEVICE_AUTHORIZATION.status
	);
}

/** One `meta_data` entry as the order document carries it (`key` is optional there). */
export type MetaDataEntry = {
	id?: number;
	key?: string;
	value?: unknown;
	[k: string]: unknown;
};

export function parseMetaValue(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return null;
	}
}

export function readLedger(metaData: readonly MetaDataEntry[] | null | undefined): PaymentRow[] {
	const entry = metaData?.find(({ key }) => key === LEDGER_META_KEY);
	const ledger = parseMetaValue(entry?.value);
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

/** In-flight settlement gate, deliberately NOT the ledger's captured-inclusive live set. */
export function hasLiveSettlementLeg(meta: readonly MetaDataEntry[] | null | undefined): boolean {
	return readLedger(meta).some(
		(row) => isInMotionPaymentStatus(row.status) && !isSettledPaymentRow(row)
	);
}

/**
 * Ledger invariant §3.4 rule 2: live rows split into voidable and refund-only (a captured row a
 * completion counted, or a captured non-manual row). For an order in progress (`pos-open |
 * pos-partial | pending | failed`): the void route refuses a captured manual row once the order has
 * left those statuses. One rule for the void command and any surface that announces its outcome.
 */
export function partitionVoidableRows(meta: readonly MetaDataEntry[] | null | undefined): {
	voidable: PaymentRow[];
	retained: PaymentRow[];
} {
	const counted = new Set(readCompletions(meta).flatMap(({ payment_ids }) => payment_ids ?? []));
	const voidable = ({ id, status, capture_mode }: PaymentRow) =>
		status !== 'captured' || (capture_mode === 'manual' && !counted.has(id));
	const live = readLedger(meta).filter(({ status }) => isLivePaymentStatus(status));
	return { voidable: live.filter(voidable), retained: live.filter((row) => !voidable(row)) };
}

export function withLedger(
	metaData: readonly MetaDataEntry[] | null | undefined,
	rows: readonly PaymentRow[]
): MetaDataEntry[] {
	const result = (metaData ?? []).filter(({ key }) => key !== PAYMENT_METHOD_INDEX_META_KEY);
	const index = result.findIndex(({ key }) => key === LEDGER_META_KEY);
	const value = { schema: LEDGER_SCHEMA, payments: [...rows] };
	if (index === -1) result.push({ key: LEDGER_META_KEY, value });
	else result[index] = { ...result[index], key: LEDGER_META_KEY, value };
	// The server owns this derivation; mirror it to keep the local read model and
	// orders filter coherent until the server echo arrives.
	const indexed = new Set<string>();
	for (const row of rows) {
		if (LIVE_PAYMENT_STATUSES.includes(row.status) && !indexed.has(row.method_id)) {
			indexed.add(row.method_id);
			result.push({ key: PAYMENT_METHOD_INDEX_META_KEY, value: row.method_id });
		}
	}
	return result;
}

/** One payment row's identity: the store lowercases the ids it is given (`strtolower`). */
export function samePaymentId(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

export function upsertPaymentRow(rows: readonly PaymentRow[], row: PaymentRow): PaymentRow[] {
	const result = [...rows];
	const index = result.findIndex((existing) => samePaymentId(existing.id, row.id));
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
	registerId: string | null;
	sessionId?: string | null;
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
			register_id: input.registerId,
			session_id: input.sessionId ?? null,
			created_at_gmt: timestamp,
			captured_at_gmt: timestamp,
			updated_at_gmt: timestamp,
		},
	};
}

export type MintServerPaymentInput = Omit<
	MintManualPaymentInput,
	'tendered' | 'recordedOffline'
> & {
	readerId?: string | null;
};
export type MintServerPaymentResult =
	| { ok: true; row: PaymentRow }
	| { ok: false; reason: 'not_server' | 'amount_not_positive' | 'no_order_id' };

export function mintServerPayment(input: MintServerPaymentInput): MintServerPaymentResult {
	if (input.method.capture.mode !== 'server') return { ok: false, reason: 'not_server' };
	return mintTerminalPayment(input, 'server', null, false);
}

export type MintDevicePaymentInput = MintServerPaymentInput & {
	transport: PaymentTransport;
	recordedOffline: boolean;
};
export function mintDevicePayment(input: MintDevicePaymentInput) {
	if (input.method.capture.mode !== 'device') return { ok: false, reason: 'not_device' } as const;
	return mintTerminalPayment(input, 'device', input.transport, input.recordedOffline);
}

function mintTerminalPayment(
	input: MintServerPaymentInput,
	mode: 'server' | 'device',
	transport: PaymentTransport | null,
	offline: boolean
): MintServerPaymentResult {
	const dp = input.dp ?? 2;
	const amount = toMinor(input.amount, dp);
	if (amount <= 0) return { ok: false, reason: 'amount_not_positive' };
	if (!offline && (!Number.isInteger(input.orderId) || !input.orderId || input.orderId <= 0))
		return { ok: false, reason: 'no_order_id' };
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
			capture_mode: mode,
			transport,
			recorded_offline: offline,
			amount: fromMinor(amount, dp),
			currency: input.currency,
			tendered: null,
			change: null,
			tip: null,
			status: 'pending',
			failure_reason: null,
			refunded_amount: fromMinor(0, dp),
			refunds: [],
			provider_refs: input.readerId ? { reader: input.readerId } : {},
			receipt: {},
			cashier_id: input.cashierId,
			store_id: input.storeId,
			register_id: input.registerId,
			session_id: input.sessionId ?? null,
			created_at_gmt: timestamp,
			captured_at_gmt: null,
			updated_at_gmt: timestamp,
			events: [],
			expires_at: null,
			void_requested_at: null,
		},
	};
}
