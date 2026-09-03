/**
 * Pure derivation mirrors the server ledger so balance and order status have one contract.
 */

import { fromMinor, toMinor } from './money';

import type { DerivedOrderView, PaymentMethodDescriptor, PaymentRow } from './types';

const COUNTING_STATUSES = new Set(['authorized', 'captured']);
const LIVE_STATUSES = new Set(['pending', 'authorized', 'captured']);

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
		.filter(({ row }) => COUNTING_STATUSES.has(row.status));
	const totalMinor = toMinor(total, dp);
	const paidMinor = counting.reduce((sum, { amount }) => sum + amount, 0);
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
	if (totalMinor > 0 && paidMinor >= totalMinor) {
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
		if (LIVE_STATUSES.has(row.status) && !seenMethodIds.has(row.method_id)) {
			seenMethodIds.add(row.method_id);
			methodIds.push(row.method_id);
		}
	}

	return {
		paid: fromMinor(paidMinor, dp),
		balance: fromMinor(Math.max(0, totalMinor - paidMinor), dp),
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
