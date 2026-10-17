import type { RefundDocumentType } from '@wcpos/database';
import { fromMinor, toMinor } from '@wcpos/order-math';

type LedgerRow = {
	id?: string;
	/** The order the row belongs to, when the caller keeps it; counts distinct orders. */
	order?: string;
	refunds?: readonly { id: number; amount: string; status: string }[];
	session_id?: string | null;
	kind: string;
	method_id: string;
	status: string;
	amount: string;
	refunded_amount: string;
};
type Movement = {
	reason?: string;
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
	const countByMethod: Record<string, number> = {};
	const ids = new Set<number | string>();
	const allocated = new Map<number, number>();
	const debit = (method: string, amount: number) => {
		byMethod[method] = (byMethod[method] ?? 0) + amount;
	};
	// A refund split across tenders is one refund overall but one per method it touched.
	const seenByMethod: Record<string, Set<number | string>> = {};
	const counted = (method: string, id: number | string) => {
		ids.add(id);
		const seen = (seenByMethod[method] ??= new Set());
		if (seen.has(id)) return;
		seen.add(id);
		countByMethod[method] = (countByMethod[method] ?? 0) + 1;
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
				counted(method, allocation.id);
			}
		}
		const legacy = Math.max(0, toMinor(row.refunded_amount, 4) - covered);
		if (row.session_id === sessionId && row.status === 'captured') {
			debit(method, legacy);
			if (legacy <= 0) continue;
			for (const id of legacyIds) counted(method, id);
			// Aggregate-only historical rows cannot supply an exact identity/count.
			if (!legacyIds.size) counted(method, `legacy-row:${index}`);
		}
	}
	for (const [id, record] of stamped) {
		if (record.sessionId !== sessionId) continue;
		const amount = toMinor(record.refund.amount ?? '0', 4) - (allocated.get(id) ?? 0);
		if (amount > 0) {
			debit('cash', amount);
			counted('cash', id);
		}
	}
	return { byMethod, count: ids.size, countByMethod };
}

export function deriveExpected(
	{
		session,
		movements,
		ledgerRowsBySession,
		refundRecords = [],
	}: {
		session: {
			id: string;
			counted_float: string;
			server_expected?: Record<string, string> | null;
			server_ledger_rows?: readonly { id?: string; status?: string }[] | null;
		};
		movements: readonly Movement[];
		ledgerRowsBySession: readonly LedgerRow[];
		refundRecords?: readonly RefundDocumentType[];
	},
	baselineHas?: (id: string | number | null | undefined) => boolean
): Record<string, string> {
	if (session.server_expected && baselineHas) {
		const delta = deriveUnsyncedDelta(
			{ session, movements, ledgerRowsBySession, refundRecords },
			baselineHas
		);
		const expected = { ...session.server_expected };
		for (const [method, amount] of Object.entries(delta)) {
			if (toMinor(amount, 4))
				expected[method] = fromMinor(toMinor(expected[method] ?? '0', 4) + toMinor(amount, 4), 4);
		}
		return expected;
	}
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

/** The display terms use the same session attribution and four-decimal arithmetic. */
export function deriveDrawerTerms(input: Parameters<typeof deriveExpected>[0]) {
	const { session, movements, ledgerRowsBySession, refundRecords = [] } = input;
	const own = movements.filter((row) => row.session_id === session.id);
	const voids = new Set(own.filter((row) => row.type === 'void').map((row) => row.voids));
	const live = own.filter((row) => !row.voided_by && !voids.has(row.id));
	const cash = ledgerRowsBySession.filter(
		(row) => row.session_id === session.id && row.status === 'captured' && row.kind === 'cash'
	);
	const paidOut = live.filter((row) => row.type === 'paid_out');
	const total = (rows: readonly { amount: string }[]) =>
		fromMinor(
			rows.reduce((sum, row) => sum + toMinor(row.amount, 4), 0),
			4
		);
	const refunds = attributeRefunds(session.id, ledgerRowsBySession, refundRecords);
	return {
		float: fromMinor(toMinor(session.counted_float, 4), 4),
		cashSales: {
			amount: total(cash),
			// Distinct orders when rows carry their order; a split cash payment is one sale.
			count: cash.every((row) => row.order)
				? new Set(cash.map((row) => row.order)).size
				: cash.length,
		},
		paidIn: live
			.filter((row) => row.type === 'paid_in')
			.map((row) => ({
				amount: fromMinor(toMinor(row.amount, 4), 4),
				note: row.reason,
			})),
		paidOut: {
			amount: total(paidOut),
			count: paidOut.length,
			note: paidOut.length === 1 ? paidOut[0].reason : undefined,
		},
		cashRefunds: {
			amount: fromMinor(refunds.byMethod.cash ?? 0, 4),
			count: refunds.countByMethod.cash ?? 0,
		},
		noSales: live.filter((row) => row.type === 'no_sale').length,
		voids: live.filter((row) => row.type === 'void').length,
		expected: deriveExpected(input).cash,
	};
}

export function deriveUnsyncedDelta(
	input: Parameters<typeof deriveExpected>[0],
	baselineHas: (id: string | number | null | undefined) => boolean
): Record<string, string> {
	// Compare the full local view with only the part already represented in the baseline.
	// Restoring a synced target's pending void marker makes its reversal a signed debit.
	const full = deriveExpected(input);
	for (const row of input.ledgerRowsBySession) {
		if (row.session_id !== input.session.id || !baselineHas(row.id)) continue;
		const snapshot = input.session.server_ledger_rows?.find(({ id }) => id === row.id);
		if (
			['voided', 'failed'].includes(row.status) &&
			snapshot &&
			['captured', 'authorized'].includes(snapshot.status ?? '')
		) {
			const method = row.kind === 'cash' ? 'cash' : row.method_id;
			full[method] = fromMinor(toMinor(full[method] ?? '0', 4) - toMinor(row.amount, 4), 4);
		}
	}
	const known = deriveExpected({
		...input,
		movements: input.movements
			.filter((row) => baselineHas(row.id))
			.map((row) => ({
				...row,
				voided_by: baselineHas(row.voided_by) ? row.voided_by : null,
			})),
		ledgerRowsBySession: input.ledgerRowsBySession
			.filter((row) => baselineHas(row.id))
			.map((row) => ({
				...row,
				refunds: row.refunds?.filter((refund) => baselineHas(refund.id)),
				refunded_amount: fromMinor(
					toMinor(row.refunded_amount, 4) -
						(row.refunds ?? [])
							.filter((refund) => !baselineHas(refund.id) && refund.status === 'succeeded')
							.reduce((sum, refund) => sum + toMinor(refund.amount, 4), 0),
					4
				),
			})),
		refundRecords: input.refundRecords?.filter((row) => baselineHas(row.id)),
	});
	return Object.fromEntries(
		Object.keys({ ...full, ...known }).map((method) => [
			method,
			fromMinor(toMinor(full[method] ?? '0', 4) - toMinor(known[method] ?? '0', 4), 4),
		])
	);
}
