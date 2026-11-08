import {
	countsTowardPaid,
	isLivePaymentStatus,
	type PaymentRow,
	readPaidUnits,
	toMinor,
} from '@wcpos/order-math';
import type { EngineRecord } from '@wcpos/query';

import { paidUnitsByLine, type TenderLineId, type TenderPlan } from './tender-state';
import { useAllocations, usePickedUnits, useSplitOn } from '../checkout-mode';
import { getUuidFromLineItem } from '../../hooks/utils';

type Payload = EngineRecord<'orders'>['payload'];
/** Payment row id → line id → units: what each payment paid for. */
export type Allocations = Record<string, Record<TenderLineId, number>>;

/** One empty pick for every render without picks, so its identity says "nothing changed". */
const NO_PICKS: Record<TenderLineId, number> = {};

/** The split as this till holds it for one order (the checkout store): the pane and the bill share it. */
export interface SplitStore {
	/** Each payment's units, frozen at its press; null until a payment carries some. */
	allocations: Allocations | null;
	/** THIS payment's picked units per line. */
	picked: Record<TenderLineId, number>;
	/** The Split chip is on: the bill picks and the pane offers the split. */
	splitOn: boolean;
}

/** Subscribed, so a pick, the chip or a landed allocation re-renders the reader. */
export function useSplitStore(uuid: string): SplitStore {
	return {
		allocations: useAllocations(uuid),
		picked: usePickedUnits(uuid) ?? NO_PICKS,
		splitOn: useSplitOn(uuid),
	};
}

/** The order's item lines as a split picks them: keyed as the bill's rows, tax inside the money. */
export function tenderLines(items: Payload['line_items'], dp: number) {
	return (items ?? []).flatMap(({ name, quantity, total, total_tax, ...line }) => {
		// A line removed offline stays as a tombstone (`product_id: null`, as `useCartLines` filters)
		// until the deletion syncs: it is not on the bill and cannot be picked or paid for.
		if (line.product_id === null) return [];
		const id = getUuidFromLineItem(line) ?? line.id;
		// Tax is always inside the money a unit adds to a payment, whatever the cart shows.
		const totalMinor = toMinor(total ?? '0', dp) + toMinor(total_tax ?? '0', dp);
		return id === undefined ? [] : [{ id, name: name ?? '', quantity: quantity ?? 1, totalMinor }];
	});
}

/** The order's journaled units (`_wcpos_paid_units`: a completed sale reopened, a restart) under this till's. */
export function mergedAllocations(meta: Payload['meta_data'], store: Allocations | null) {
	return { ...readPaidUnits(meta), ...(store ?? {}) };
}

/**
 * The legs a plan has taken: its rows from `plan.from` on that `derive()` counts (ADR 0040 D6),
 * so an authorization (a hold) never advances it. No plan, no legs.
 */
export function rowsSince(
	plan: Pick<TenderPlan, 'from'> | null,
	rows: readonly PaymentRow[],
	dp: number,
	titleOf: (methodId: string) => string
) {
	return rows
		.slice(plan?.from ?? rows.length)
		.filter(countsTowardPaid)
		.map((row) => ({ minor: toMinor(row.amount, dp), title: titleOf(row.method_id) }));
}

export interface SplitFacts {
	payload: Pick<Payload, 'meta_data' | 'line_items'>;
	/** The order's ledger rows, in ledger order. */
	rows: readonly PaymentRow[];
	dp: number;
	/** The title a payment shows for its method. */
	titleOf: (methodId: string) => string;
	store: SplitStore;
	/** The tender's stored plan (the reducer's); the bill and the order view plan nothing. */
	plan: TenderPlan | null;
}

/** Every split fact the pane, the bill and the order view read, derived once from its three holders. */
export type SplitView = ReturnType<typeof splitView>;

export function splitView({ payload, rows, dp, titleOf, store, plan }: SplitFacts) {
	const lines = tenderLines(payload.line_items, dp);
	const allocations = mergedAllocations(payload.meta_data, store.allocations);
	const liveRows = rows.filter(({ status }) => isLivePaymentStatus(status));
	const paidUnits = paidUnitsByLine(
		allocations,
		liveRows.map((row) => ({ id: row.id, title: titleOf(row.method_id) }))
	);
	// A shared item payment allocates the whole group's units to the group's first leg; the later
	// legs pay the rest of the group's money and carry none, or the units would count as paid once
	// per leg.
	const groupAllocated =
		plan?.kind === 'items' &&
		rows.slice(plan.from).some((row) => isLivePaymentStatus(row.status) && allocations[row.id]);
	return {
		lines,
		allocations,
		/** Units of each line the live payments covered, with their methods (`paidUnitsByLine`). */
		paidUnits,
		/** Units of each line no live payment covers, by `String(line id)`. */
		unpaidUnits: Object.fromEntries(
			lines.map(({ id, quantity }) => [
				String(id),
				Math.max(0, quantity - (paidUnits[id]?.units ?? 0)),
			])
		),
		picked: store.picked,
		splitOn: store.splitOn,
		/** The units THIS payment records: the picks, else an unallocated item group's, else none. */
		legUnits:
			Object.keys(store.picked).length > 0
				? store.picked
				: plan?.kind === 'items' && !groupAllocated
					? plan.units
					: null,
		/** The legs the stored plan has taken (`rowsSince`). */
		rowsSinceFrom: rowsSince(plan, rows, dp, titleOf),
	};
}
