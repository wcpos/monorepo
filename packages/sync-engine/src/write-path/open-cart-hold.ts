/**
 * THE OPEN-CART HOLD — one rule, two readers.
 *
 * An order the cashier is still building carries the local status `pos-open`,
 * and the write-drain lane deliberately leaves its queued edits alone: pushing
 * every keystroke of a cart in progress would spam the store with revisions of
 * a sale that has not happened yet. The row therefore sits in the queue at
 * `pending` for as long as the cart is open — by design, not by fault.
 *
 * That is invisible to the drain (it just skips the row) but NOT to the health
 * screens, which read the same queue and counted a held row under "changes
 * waiting to send" — a red number the cashier cannot act on and cannot see the
 * change behind, because the change IS the open cart in front of them. The
 * queue's own reasoning for excluding conflicted/needs-revision rows applies
 * word for word: those are waiting on a HUMAN, not on the store.
 *
 * So the predicate lives here, once, and both readers ask it: the drain wiring
 * (which pairs it with a resident read per mutation) and the health counter
 * (which pairs it with the live set of open-cart records). A copy in the UI
 * would be a check reading a PROXY of the rule — it would drift the first time
 * the hold's terms changed.
 *
 * NOTE. Held work is still UNSENT WORK. `countUnsentChanges` — what a wipe
 * warns about — deliberately counts the WHOLE queue and must never adopt this
 * exclusion: losing an open cart is losing a sale. That is the one place the
 * two fault-counter families are supposed to disagree; see CONTEXT.md
 * § Language — Fault counters for the three questions and which counter answers
 * which.
 */

import type { QueuedMutation } from '@wcpos/sync-core';

/** The local order status an in-progress cart carries until the sale settles. */
export const OPEN_CART_ORDER_STATUS = 'pos-open';

/** The fields the rule reads — structural, so a health screen can pass a row it read from storage. */
export type HoldCandidate = Pick<
	QueuedMutation,
	'collectionName' | 'operation' | 'recordId' | 'explicit' | 'status'
>;

/**
 * Everything the hold decides WITHOUT the resident record: is this the kind of
 * row an open cart holds back? The caller supplies the other half — whether the
 * record is actually an open cart.
 *
 * A claimed (or conflicted/rejected/…) row is never held: it is already past
 * the point the hold protects. An `explicit` row is the cashier asking for the
 * push, and a delete is a release — both must reach the server.
 */
export function isOpenCartHoldCandidate(mutation: HoldCandidate): boolean {
	if (mutation.status !== undefined && mutation.status !== 'pending') return false;
	if (mutation.collectionName !== 'orders') return false;
	if (mutation.operation === 'delete') return false;
	if (mutation.explicit === true) return false;
	return true;
}

/**
 * The rows a set of queued mutations currently holds for open carts.
 *
 * Record-scoped, mirroring the drain's `releaseRecords`: an explicit push or a
 * delete anywhere in a record's chain drains the WHOLE chain, so none of that
 * record's rows are held — otherwise the count would hide edits that are, in
 * fact, on their way to the store.
 */
export function heldOpenCartMutations<T extends HoldCandidate>(
	rows: readonly T[],
	openCartRecordIds: ReadonlySet<string>
): T[] {
	const released = new Set(
		rows
			.filter((row) => row.explicit === true || row.operation === 'delete')
			.map((row) => row.recordId)
	);
	return rows.filter(
		(row) =>
			!released.has(row.recordId) &&
			openCartRecordIds.has(row.recordId) &&
			isOpenCartHoldCandidate(row)
	);
}
