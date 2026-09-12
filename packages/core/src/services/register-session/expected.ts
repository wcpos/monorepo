import { fromMinor, toMinor } from '@wcpos/order-math';

type LedgerRow = {
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
export function deriveExpected({
	session,
	movements,
	ledgerRowsBySession,
}: {
	session: { id: string; counted_float: string };
	movements: readonly Movement[];
	ledgerRowsBySession: readonly LedgerRow[];
}): Record<string, string> {
	// Server money uses four decimals. Integer arithmetic avoids floating-point drift.
	const totals: Record<string, number> = { cash: toMinor(session.counted_float, 4) };
	for (const row of ledgerRowsBySession) {
		if (row.session_id !== session.id || row.status !== 'captured') continue;
		const method = row.kind === 'cash' ? 'cash' : row.method_id;
		totals[method] =
			(totals[method] ?? 0) + toMinor(row.amount, 4) - toMinor(row.refunded_amount, 4);
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
