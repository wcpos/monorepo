import { POS_META_KEYS } from '@wcpos/sync-core';
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
	reason?: string | null;
	id: string;
	session_id: string;
	type: string;
	amount?: string | null;
	voided_by?: string | null;
	voids?: string | null;
};
/**
 * The detail route's drawer terms, from the same snapshot as `server_expected`. Every field is
 * optional: a partial block reads its missing terms as zero rather than failing adoption.
 */
type ServerTerms = {
	float?: string;
	cash_sales?: { amount?: string; count?: number };
	paid_in?: readonly { id?: string; amount?: string; reason?: string | null }[];
	paid_out?: { amount?: string; count?: number; note?: string | null };
	cash_refunds?: { amount?: string; count?: number };
	no_sales?: number;
	voids?: number;
};
/** Shared drawer/closure debits, in four-decimal minor units. */
export function attributeRefunds(
	sessionId: string,
	ledgerRows: readonly LedgerRow[],
	refundRecords: readonly RefundDocumentType[]
) {
	const stamped = new Map(
		refundRecords.flatMap((refund) => {
			const stamp = refund.meta_data?.find(({ key }) => key === POS_META_KEYS.session)?.value;
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
			counted_float?: string | null;
			server_expected?: Record<string, string> | null;
			server_terms?: ServerTerms | null;
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

type BaselineHas = (id: string | number | null | undefined) => boolean;
const sumMinor = (rows: readonly { amount?: string | null }[]) =>
	rows.reduce((total, row) => total + toMinor(row.amount, 4), 0);
const display = (amount: string | null | undefined) => fromMinor(toMinor(amount, 4), 4);

/** The terms over one view of the rows, in four-decimal minor units. */
function localTerms(input: Parameters<typeof deriveExpected>[0]) {
	const { session, movements, ledgerRowsBySession, refundRecords = [] } = input;
	const own = movements.filter((row) => row.session_id === session.id);
	const voids = new Set(own.filter((row) => row.type === 'void').map((row) => row.voids));
	const live = own.filter((row) => !row.voided_by && !voids.has(row.id));
	const cash = ledgerRowsBySession.filter(
		(row) => row.session_id === session.id && row.status === 'captured' && row.kind === 'cash'
	);
	const refunds = attributeRefunds(session.id, ledgerRowsBySession, refundRecords);
	return {
		float: toMinor(session.counted_float, 4),
		cashSales: sumMinor(cash),
		// Distinct orders when rows carry their order; a split cash payment is one sale.
		cashSalesCount: cash.every((row) => row.order)
			? new Set(cash.map((row) => row.order)).size
			: cash.length,
		paidIn: live.filter((row) => row.type === 'paid_in'),
		paidOut: live.filter((row) => row.type === 'paid_out'),
		cashRefunds: refunds.byMethod.cash ?? 0,
		cashRefundsCount: refunds.countByMethod.cash ?? 0,
		noSales: live.filter((row) => row.type === 'no_sale').length,
		voids: live.filter((row) => row.type === 'void').length,
	};
}

/**
 * The display terms use the same session attribution and four-decimal arithmetic as
 * `deriveExpected`. Given the server's terms and the baseline, each term is the server's figure
 * plus this device's unsynced delta, computed exactly as `deriveUnsyncedDelta` computes it, so
 * the chips add up to the anchored total on a register shared by several devices.
 */
export function deriveDrawerTerms(
	input: Parameters<typeof deriveExpected>[0],
	baselineHas?: BaselineHas
) {
	const expected = deriveExpected(input, baselineHas).cash;
	const full = localTerms(input);
	const terms = input.session.server_terms;
	if (!terms || !baselineHas) {
		return {
			float: fromMinor(full.float, 4),
			cashSales: { amount: fromMinor(full.cashSales, 4), count: full.cashSalesCount },
			paidIn: full.paidIn.map((row) => ({ amount: display(row.amount), note: row.reason })),
			paidOut: {
				amount: fromMinor(sumMinor(full.paidOut), 4),
				count: full.paidOut.length,
				note: full.paidOut.length === 1 ? full.paidOut[0].reason : undefined,
			},
			cashRefunds: { amount: fromMinor(full.cashRefunds, 4), count: full.cashRefundsCount },
			noSales: full.noSales,
			voids: full.voids,
			expected,
		};
	}
	// A missing term is zero; the float, which both views share, falls back to the session's.
	const server = {
		float: terms.float ?? input.session.counted_float,
		cash_sales: { amount: terms.cash_sales?.amount ?? '0', count: terms.cash_sales?.count ?? 0 },
		paid_in: terms.paid_in ?? [],
		paid_out: {
			amount: terms.paid_out?.amount ?? '0',
			count: terms.paid_out?.count ?? 0,
			note: terms.paid_out?.note,
		},
		cash_refunds: {
			amount: terms.cash_refunds?.amount ?? '0',
			count: terms.cash_refunds?.count ?? 0,
		},
		no_sales: terms.no_sales ?? 0,
		voids: terms.voids ?? 0,
	};
	const known = localTerms(baselineView(input, baselineHas));
	const plus = (amount: string, delta: number) => fromMinor(toMinor(amount, 4) + delta, 4);
	const voidedLegs = voidedBaselineLegs(input, baselineHas).filter((row) => row.kind === 'cash');
	/**
	 * Sales are counted by order sets, not by subtracting counts: an order the baseline counted
	 * (its leg captured in the snapshot, even if voided here) and that still has a captured cash
	 * leg here is the server's sale, whichever leg now carries it, so a void-and-retender on one
	 * order adds nothing. A leg without its order is its own sale.
	 */
	const own = (row: LedgerRow) => row.session_id === input.session.id && row.kind === 'cash';
	const sale = (row: LedgerRow) => row.order ?? `leg:${row.id}`;
	const ordersNow = new Set(
		input.ledgerRowsBySession.filter((row) => own(row) && row.status === 'captured').map(sale)
	);
	const ordersKnown = new Set(
		input.ledgerRowsBySession
			.filter((row) => {
				if (!own(row) || !baselineHas(row.id)) return false;
				const snapshot = input.session.server_ledger_rows?.find(({ id }) => id === row.id);
				return (snapshot?.status ?? row.status) === 'captured';
			})
			.map(sale)
	);
	const salesDelta =
		[...ordersNow].filter((order) => !ordersKnown.has(order)).length -
		[...ordersKnown].filter((order) => !ordersNow.has(order)).length;
	// Paid-ins are listed: the server's, less any this device has since voided, then the new ones.
	const paidIn = server.paid_in.map((row) => ({
		id: row.id,
		minor: toMinor(row.amount ?? '0', 4),
		note: row.reason ?? undefined,
	}));
	const fullIds = new Set(full.paidIn.map((row) => row.id));
	let correction = 0;
	for (const row of known.paidIn.filter(({ id }) => !fullIds.has(id))) {
		const amount = toMinor(row.amount, 4);
		let at = paidIn.findIndex((entry) => entry.id === row.id);
		// Older servers list no ids: match by amount and reason among the entries without one.
		if (at < 0)
			at = paidIn.findIndex(
				(entry) =>
					entry.id === undefined &&
					entry.minor === amount &&
					(entry.note ?? null) === (row.reason ?? null)
			);
		if (at >= 0) paidIn.splice(at, 1);
		else correction += amount;
	}
	// An unmatched debit comes off the listed entries from the end, never as a negative row.
	for (let at = paidIn.length - 1; at >= 0 && correction > 0; at--) {
		const taken = Math.min(paidIn[at].minor, correction);
		paidIn[at].minor -= taken;
		correction -= taken;
		if (!paidIn[at].minor) paidIn.splice(at, 1);
	}
	for (const row of full.paidIn.filter(({ id }) => !baselineHas(id)))
		paidIn.push({ id: row.id, minor: toMinor(row.amount, 4), note: row.reason ?? undefined });
	const paidOutCount = server.paid_out.count + full.paidOut.length - known.paidOut.length;
	// With one paid-out left, it is the one new here, or else the server's only one.
	const fresh = full.paidOut.filter(({ id }) => !baselineHas(id));
	const paidOutNote =
		paidOutCount !== 1
			? undefined
			: fresh.length === 1
				? fresh[0].reason
				: server.paid_out.count === 1
					? (server.paid_out.note ?? undefined)
					: undefined;
	return {
		// Both views share the session's float; the server's figure is the anchor.
		float: display(server.float),
		cashSales: {
			amount: plus(
				server.cash_sales.amount,
				full.cashSales - sumMinor(voidedLegs) - known.cashSales
			),
			count: server.cash_sales.count + salesDelta,
		},
		paidIn: paidIn.map(({ minor, note }) => ({ amount: fromMinor(minor, 4), note })),
		paidOut: {
			amount: plus(server.paid_out.amount, sumMinor(full.paidOut) - sumMinor(known.paidOut)),
			count: paidOutCount,
			note: paidOutNote,
		},
		cashRefunds: {
			amount: plus(server.cash_refunds.amount, full.cashRefunds - known.cashRefunds),
			count: server.cash_refunds.count + full.cashRefundsCount - known.cashRefundsCount,
		},
		noSales: server.no_sales + full.noSales - known.noSales,
		voids: server.voids + full.voids - known.voids,
		expected,
	};
}

/**
 * Baseline-held legs this device has voided or failed since the snapshot counted them: the
 * baseline view keeps their local status, so the full view must debit them itself. The server's
 * session figures count captured rows only (ADR 0040 D6), so an authorization was never counted.
 */
function voidedBaselineLegs(input: Parameters<typeof deriveExpected>[0], baselineHas: BaselineHas) {
	return input.ledgerRowsBySession.filter((row) => {
		if (row.session_id !== input.session.id || !baselineHas(row.id)) return false;
		const snapshot = input.session.server_ledger_rows?.find(({ id }) => id === row.id);
		return (
			['voided', 'failed'].includes(row.status) && !!snapshot && snapshot.status === 'captured'
		);
	});
}

/** Only the part of the local view the baseline already represents. */
function baselineView(
	input: Parameters<typeof deriveExpected>[0],
	baselineHas: BaselineHas
): Parameters<typeof deriveExpected>[0] {
	return {
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
	};
}

export function deriveUnsyncedDelta(
	input: Parameters<typeof deriveExpected>[0],
	baselineHas: BaselineHas
): Record<string, string> {
	// Compare the full local view with only the part already represented in the baseline.
	// Restoring a synced target's pending void marker makes its reversal a signed debit.
	const full = deriveExpected(input);
	for (const row of voidedBaselineLegs(input, baselineHas)) {
		const method = row.kind === 'cash' ? 'cash' : row.method_id;
		full[method] = fromMinor(toMinor(full[method] ?? '0', 4) - toMinor(row.amount, 4), 4);
	}
	const known = deriveExpected(baselineView(input, baselineHas));
	return Object.fromEntries(
		Object.keys({ ...full, ...known }).map((method) => [
			method,
			fromMinor(toMinor(full[method] ?? '0', 4) - toMinor(known[method] ?? '0', 4), 4),
		])
	);
}
