/**
 * Pure derivation mirrors the server ledger so balance and order status have one contract.
 */

import { isLivePaymentStatus } from './ledger';
import { fromMinor, toMinor } from './money';

import type { DerivedOrderView, PaymentMethodDescriptor, PaymentRow } from './types';

// ADR 0040 D6: only captured money counts toward paid; an authorization is a hold, not
// payment. Mirrors the server's `Ledger::COUNTING_STATUSES`.
const COUNTING_STATUSES = new Set(['captured']);
/** Whether a row counts toward paid (ADR 0040 D6): the one predicate `derive()` applies. */
export function countsTowardPaid(row: Pick<PaymentRow, 'status'>): boolean {
	return COUNTING_STATUSES.has(row.status);
}

/** Server ledger amounts have six decimal places, independent of currency display precision. */
function toMicro(value: string): number {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? Math.round(numeric * 1e6) : 0;
}

/** Remaining major currency units after pending and succeeded allocations, compared in micro-units. */
export function availableForRefund(row: PaymentRow): number {
	const allocated = (Array.isArray(row.refunds) ? row.refunds : [])
		.filter((entry) => entry?.status === 'pending' || entry?.status === 'succeeded')
		.reduce((sum, entry) => sum + toMicro(entry.amount), 0);
	return Math.max(0, toMicro(row.amount) - allocated) / 1e6;
}

/** Whether any paid row still has refundable money at the server's six-decimal precision. */
export function hasRefundableMoney(rows: readonly PaymentRow[]): boolean {
	return rows.some((row) => countsTowardPaid(row) && availableForRefund(row) > 0);
}

/** Bound by order remainder and captured money. A ledger allocation is written inside its Woo refund,
 * so pending ones are in Woo's history too; only manual refunds have no allocation. */
export function netRefundable(
	orderTotal: string,
	wooRefunds: readonly { total?: string | null }[],
	rows: readonly PaymentRow[]
): number {
	const refunded = wooRefunds.reduce(
		(sum, refund) => sum + Math.abs(toMicro(refund.total ?? '0')),
		0
	);
	const captured = rows.filter(countsTowardPaid);
	let available = captured.reduce((sum, row) => sum + toMicro(String(availableForRefund(row))), 0);
	const representedAllocated = captured
		.flatMap((row) => (Array.isArray(row.refunds) ? row.refunds : []))
		.filter((entry) => entry?.status === 'pending' || entry?.status === 'succeeded')
		.reduce((sum, entry) => sum + toMicro(entry.amount), 0);
	const unallocated = Math.max(0, refunded - representedAllocated);
	available = Math.max(0, available - unallocated);
	const remaining = Math.abs(toMicro(orderTotal)) - refunded;
	// Only captured rows bound the money: a ledger of failed or authorized rows (an online-paid order whose
	// POS attempt was refused) keeps the order-total bound, or Refund would open on a 0 maximum.
	return Math.max(0, captured.length ? Math.min(remaining, available) : remaining) / 1e6;
}

/** Hide Cancelled while captured money remains after refund allocations and unallocated Woo refunds. */
export function allowedOrderStatuses(
	base: readonly string[],
	currentStatus: string,
	order: {
		total?: string | null;
		refunds?: readonly { total?: string | null }[] | null;
		rows: readonly PaymentRow[];
	}
): string[] {
	const { total, refunds, rows } = order;
	const refundable =
		hasRefundableMoney(rows) && netRefundable(total ?? '0', refunds ?? [], rows) > 0;
	return base.filter((status) => status !== 'cancelled' || !refundable || status === currentStatus);
}

/** Σ succeeded refund allocations over every row (wire rows may omit `refunds`). */
function refunded(payments: readonly PaymentRow[], dp: number): number {
	return payments.reduce((sum, row) => {
		const refunds = Array.isArray(row.refunds) ? row.refunds : [];
		return refunds.reduce(
			(inner, entry) => (entry?.status === 'succeeded' ? inner + toMinor(entry.amount, dp) : inner),
			sum
		);
	}, 0);
}

function captureTime(value: string | null): number {
	if (value === null) return Number.POSITIVE_INFINITY;
	const time = Date.parse(value);
	return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

export function derive(
	total: string | number | null | undefined,
	payments: readonly PaymentRow[],
	descriptors:
		readonly PaymentMethodDescriptor[] | Readonly<Record<string, PaymentMethodDescriptor>>,
	options: { dp?: number } = {}
): DerivedOrderView {
	const dp = options.dp ?? 2;
	const descriptorById: Record<string, PaymentMethodDescriptor> = {};
	const descriptorList = Array.isArray(descriptors) ? descriptors : Object.values(descriptors);
	for (const descriptor of descriptorList) descriptorById[descriptor.id] = descriptor;

	const counting = payments
		.map((row) => ({ row, amount: toMinor(row.amount, dp) }))
		.filter(({ row }) => countsTowardPaid(row));
	const totalMinor = toMinor(total, dp);
	const paidMinor = counting.reduce((sum, { amount }) => sum + amount, 0);
	// Server `Ledger::signed_balance`: a succeeded refund on a reopened sale is due again. A pending
	// refund allocation is a reservation, never added.
	const dueMinor = totalMinor - paidMinor + refunded(payments, dp);
	const changeMinor = counting.reduce((sum, { row, amount }) => {
		return row.tendered === null ? sum : sum + Math.max(0, toMinor(row.tendered, dp) - amount);
	}, 0);

	const nonStoredValue = counting.filter(({ row }) => row.kind !== 'stored_value');
	const candidates = nonStoredValue.length > 0 ? nonStoredValue : counting;
	const primary = candidates.reduce<(typeof candidates)[number] | undefined>((selected, item) => {
		if (!selected || item.amount > selected.amount) return item;
		if (item.amount < selected.amount) return selected;
		return captureTime(item.row.captured_at_gmt) < captureTime(selected.row.captured_at_gmt)
			? item
			: selected;
	}, undefined);
	const primaryRow = primary?.row;

	const titles: string[] = [];
	const seenTitles = new Set<string>();
	for (const { row } of counting) {
		const title = descriptorById[row.method_id]?.title ?? row.method_id;
		if (!seenTitles.has(title)) {
			seenTitles.add(title);
			titles.push(title);
		}
	}

	let status: DerivedOrderView['status'];
	if (totalMinor > 0 && dueMinor <= 0) {
		status = primaryRow
			? (descriptorById[primaryRow.method_id]?.defaults?.order_status ?? 'completed')
			: 'completed';
	} else if (payments.some((row) => row.status === 'pending')) {
		status = 'pending';
	} else if (paidMinor > 0) {
		status = 'pos-partial';
	} else {
		status = 'pos-open';
	}

	const methodIds: string[] = [];
	const seenMethodIds = new Set<string>();
	for (const row of payments) {
		if (isLivePaymentStatus(row.status) && !seenMethodIds.has(row.method_id)) {
			seenMethodIds.add(row.method_id);
			methodIds.push(row.method_id);
		}
	}

	return {
		paid: fromMinor(paidMinor, dp),
		balance: fromMinor(Math.max(0, dueMinor), dp),
		overpaid: fromMinor(Math.max(0, paidMinor - totalMinor), dp),
		change: fromMinor(changeMinor, dp),
		status,
		payment_method: primaryRow?.method_id ?? null,
		payment_method_title: titles.join(' + '),
		// Rows come off the wire; a malformed row (no provider_refs) must not throw here.
		transaction_id:
			primaryRow?.provider_refs?.payment_intent ?? primaryRow?.provider_refs?.transaction_id ?? '',
		method_ids: methodIds,
	};
}

export function isCompletingStatus(status: string): boolean {
	return !['pos-open', 'pos-partial', 'pending', 'failed', ''].includes(status);
}
