import type { RefundDocumentType } from '@wcpos/database';
import { fromMinor, toMinor } from '@wcpos/order-math';

type LedgerRow = {
	id?: string;
	refunds?: readonly { id: number; amount: string; status: string }[];
	session_id?: string | null;
	kind: string;
	method_id: string;
	status: string;
	amount: string;
	refunded_amount: string;
};
type Movement = {
	id: string;
	session_id: string;
	type: string;
	amount: string;
	voided_by?: string | null;
	voids?: string | null;
};
/** Shared drawer/closure debits, in four-decimal minor units. */
export function attributeRefunds(
	sessionId: string,
	ledgerRows: readonly LedgerRow[],
	refundRecords: readonly RefundDocumentType[]
) {
	const stamped = new Map(
		refundRecords.flatMap((refund) => {
			const stamp = refund.meta_data?.find(({ key }) => key === '_wcpos_session')?.value;
			return typeof stamp === 'string' && stamp
				? [[refund.id, { refund, sessionId: stamp }] as const]
				: [];
		})
	);
	const byMethod: Record<string, number> = {};
	const ids = new Set<number | string>();
	const allocated = new Map<number, number>();
	const debit = (method: string, amount: number) => {
		byMethod[method] = (byMethod[method] ?? 0) + amount;
	};
	for (const [index, row] of ledgerRows.entries()) {
		const method = row.kind === 'cash' ? 'cash' : row.method_id;
		let covered = 0;
		const legacyIds = new Set<number>();
		for (const allocation of row.refunds ?? []) {
			if (allocation.status !== 'succeeded') continue;
			const record = stamped.get(allocation.id);
			if (!record) {
				legacyIds.add(allocation.id);
				continue;
			}
			const amount = toMinor(allocation.amount, 4);
			allocated.set(allocation.id, (allocated.get(allocation.id) ?? 0) + amount);
			covered += amount;
			if (record.sessionId === sessionId) {
				debit(method, amount);
				ids.add(allocation.id);
			}
		}
		const legacy = Math.max(0, toMinor(row.refunded_amount, 4) - covered);
		if (row.session_id === sessionId && row.status === 'captured') {
			debit(method, legacy);
			if (legacy <= 0) continue;
			for (const id of legacyIds) ids.add(id);
			// Aggregate-only historical rows cannot supply an exact identity/count.
			if (!legacyIds.size) ids.add(`legacy-row:${index}`);
		}
	}
	for (const [id, record] of stamped) {
		if (record.sessionId !== sessionId) continue;
		const amount = toMinor(record.refund.amount ?? '0', 4) - (allocated.get(id) ?? 0);
		if (amount > 0) {
			debit('cash', amount);
			ids.add(id);
		}
	}
	return { byMethod, count: ids.size };
}

export function deriveExpected({
	session,
	movements,
	ledgerRowsBySession,
	refundRecords = [],
}: {
	session: { id: string; counted_float: string };
	movements: readonly Movement[];
	ledgerRowsBySession: readonly LedgerRow[];
	refundRecords?: readonly RefundDocumentType[];
}): Record<string, string> {
	// Server money uses four decimals. Integer arithmetic avoids floating-point drift.
	const totals: Record<string, number> = { cash: toMinor(session.counted_float, 4) };
	for (const row of ledgerRowsBySession) {
		if (row.session_id !== session.id || row.status !== 'captured') continue;
		const method = row.kind === 'cash' ? 'cash' : row.method_id;
		totals[method] = (totals[method] ?? 0) + toMinor(row.amount, 4);
	}
	const refunds = attributeRefunds(session.id, ledgerRowsBySession, refundRecords);
	for (const [method, amount] of Object.entries(refunds.byMethod)) {
		totals[method] = (totals[method] ?? 0) - amount;
	}
	const voids = new Set(
		movements
			.filter((row) => row.session_id === session.id && row.type === 'void')
			.map((row) => row.voids)
	);
	for (const row of movements) {
		if (row.session_id !== session.id || row.voided_by || voids.has(row.id)) continue;
		if (row.type === 'paid_in') totals.cash += toMinor(row.amount, 4);
		if (row.type === 'paid_out') totals.cash -= toMinor(row.amount, 4);
	}
	return Object.fromEntries(
		Object.entries(totals).map(([key, value]) => [key, fromMinor(value, 4)])
	);
}
