import { pendingRecordIds, RecordMutationQueue, RxRecordMutationStorage } from '@wcpos/sync-core';

import { isOpenCartHoldCandidate } from './open-cart-hold';

/**
 * The order pull-apply guard provider: the set of order record-ids (uuids) that have un-pushed local mutations,
 * so a scheduled pull never overwrites queued local work. Reads the shared record-mutation queue (the `mutations`
 * RxDB collection) and filters to the orders collection; `pendingRecordIds` drops `rejected` dead letters, so a
 * write-rejected record is immediately syncable again (#507 regression 4). Shared by App.tsx and the order
 * scheduler tick so the wiring + the (single) collection cast live in one place.
 */
export function createOrderPendingMutationIds(
	mutationsCollection: unknown
): () => Promise<Set<string>> {
	const storage = new RxRecordMutationStorage(
		mutationsCollection as ConstructorParameters<typeof RxRecordMutationStorage>[0]
	);
	return async () =>
		pendingRecordIds(
			(await storage.list()).filter((mutation) => mutation.collectionName === 'orders')
		);
}

/** What the discarder needs to know about the incoming (server) document. */
export type IncomingOrderSettlement = { status?: unknown; datePaid?: unknown };

type OrderPayloadFacts = { status?: unknown; date_paid?: unknown; date_paid_gmt?: unknown };

/**
 * The store settled the sale: a status other than `pos-open` that came from a PAYMENT —
 * `date_paid` stamped, or the cash gateway's `pos-partial`, which is a payment without a
 * `date_paid`. A bare status change with no payment (a `completed` set from wp-admin on an
 * unpaid order, or a payload missing its status) is NOT settlement; on doubt, protect.
 */
function storeSettledSale(incoming: IncomingOrderSettlement): boolean {
	const status = incoming.status;
	if (typeof status !== 'string' || status === '' || status === 'pos-open') return false;
	return status === 'pos-partial' || Boolean(incoming.datePaid);
}

/**
 * The till still believes this is an UNPAID open cart. A reopened order is also `pos-open`
 * locally, but its resident carries the `date_paid` it adopted from the paid document — that
 * row is the cashier's reopen, never moot. Anything not `pos-open` (a void converted to
 * `pending`, an edit to a processing order) is ordinary queued work and is never touched.
 */
function tillBelievesUnpaidOpenCart(payload: OrderPayloadFacts | undefined): boolean {
	return payload?.status === 'pos-open' && !payload.date_paid && !payload.date_paid_gmt;
}

/**
 * Retire the held open-cart rows of an order the store has just settled, so the paid
 * document can be adopted instead of being `protected` by them forever.
 *
 * The open-cart hold keeps NON-explicit rows pending while the local order is `pos-open`
 * (write-drain-lane's `shouldHold`); the pull/snapshot guard treats any pending row as
 * local work that must win. Together they deadlock a paid sale whose cart settlement
 * wrote one more row after the checkout push (see order-math `computeChanged`). Such a
 * row is a cart edit the hold deliberately never sent; once the store has taken payment
 * it is moot, and releasing it later would push a stale `pos-open` document over a paid
 * order. So: only when the STORE says the sale settled AND the TILL still holds it as an
 * unpaid open cart AND every non-rejected row is a hold candidate (pending, non-explicit,
 * not a delete) — remove the rows newest-first and clear their resident bookkeeping. Any
 * explicit, claimed, conflicted or delete row keeps the record protected exactly as before.
 *
 * Returns the number of rows removed; 0 means "nothing was touched".
 */
export function createOrderHeldRowDiscarder(
	mutationsCollection: unknown,
	ordersCollection: unknown
): (recordId: string, incoming: IncomingOrderSettlement) => Promise<number> {
	const queue = new RecordMutationQueue(
		new RxRecordMutationStorage(
			mutationsCollection as ConstructorParameters<typeof RxRecordMutationStorage>[0]
		)
	);
	const orders = ordersCollection as {
		findOne(id: string): {
			exec(): Promise<{
				toJSON(): { payload?: OrderPayloadFacts };
				incrementalModify(
					fn: (data: Record<string, unknown>) => Record<string, unknown>
				): Promise<unknown>;
			} | null>;
		};
	};
	return async (recordId, incoming) => {
		if (!storeSettledSale(incoming)) return 0;
		const resident = await orders.findOne(recordId).exec();
		if (!resident || !tillBelievesUnpaidOpenCart(resident.toJSON().payload)) return 0;
		const rows = (await queue.pending()).filter(
			(row) => row.collectionName === 'orders' && row.recordId === recordId
		);
		if (!rows.length || !rows.every(isOpenCartHoldCandidate)) return 0;
		const removed = new Set<string>();
		for (const row of rows.reverse()) {
			// A refused removal means a concurrent lane already took this row (another
			// discarder, or the drain claiming it); keep going — the caller re-reads the
			// pending set afterwards and a claimed row still protects the record.
			if (await queue.removePending(row.mutationId)) removed.add(row.mutationId);
		}
		if (removed.size) {
			await resident.incrementalModify((data) => {
				const local = (data.local ?? {}) as { pendingMutationIds?: string[] };
				const remaining = (local.pendingMutationIds ?? []).filter((id) => !removed.has(id));
				return {
					...data,
					local: { ...local, pendingMutationIds: remaining, dirty: remaining.length > 0 },
				};
			});
		}
		return removed.size;
	};
}
