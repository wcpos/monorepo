import { combineLatest, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import {
	BACKLOG_QUEUE_STATUSES,
	heldOpenCartMutations,
	PARKED_QUEUE_STATUSES,
	type QueueRow,
	type QueueRowStatus,
	REJECTED_QUEUE_STATUSES,
	type RxdbSyncEngine,
} from '@wcpos/sync-engine';

import { observeBinding } from '../engine-query';
import { openCartRecordIds$ } from '../open-orders-scope';

export {
	BACKLOG_QUEUE_STATUSES,
	PARKED_QUEUE_STATUSES,
	REJECTED_QUEUE_STATUSES,
	TERMINAL_QUEUE_STATUSES,
} from '@wcpos/sync-engine';
export type QueueSelection = { statuses?: readonly QueueRowStatus[]; collectionName?: string };

export function observeQueueRows(
	engine: RxdbSyncEngine,
	selection: QueueSelection = {}
): Observable<readonly QueueRow[]> {
	return new Observable<readonly QueueRow[] | null>((subscriber) =>
		engine.queueRows$(
			(rows) => subscriber.next(rows),
			(error) => subscriber.error(error)
		)
	).pipe(
		map((rows) =>
			(rows ?? []).filter(
				(row) =>
					(!selection.statuses || selection.statuses.includes(row.status)) &&
					(!selection.collectionName || selection.collectionName === row.collectionName)
			)
		)
	);
}

/**
 * The two FAULT-COUNTER families this hook reads off the mutation queue:
 * SYNC BACKLOG and NEEDS A DECISION (CONTEXT.md § Language — Fault counters).
 *
 * Every field carries its family in its name on purpose. A third family —
 * UNSENT WORK, `countUnsentChanges` — is a deliberately DIFFERENT number over
 * the SAME queue: it counts the held carts and the terminal rows these fields
 * exclude, because a reset destroys them. The two answers contradict each
 * other and both are correct. A bare `pending` left the next reader no way to
 * tell "correct by design" from "one of these is broken", and the cheap move
 * from there is to unify them — which would make both wrong (#1561).
 */
export type EngineMutationCounts = {
	/**
	 * SYNC BACKLOG — answers "is sync healthy?".
	 *
	 * Every outbound record waiting for the network (`pending` or `claimed`),
	 * MINUS the rows the engine holds by design while their cart is open (see
	 * `open-cart-hold.ts`). Conflict records are reported by the separate
	 * needs-a-decision counters.
	 *
	 * Never the number a reset warns about: a held cart and a dead letter are
	 * both unsent work, and both are absent from here.
	 */
	syncBacklog: number;
	/**
	 * SYNC BACKLOG, sales only. The number of distinct `orders` records with a
	 * row in `syncBacklog`. Open carts are excluded exactly as `syncBacklog`
	 * excludes them, so this counts completed sales waiting for the store.
	 */
	syncBacklogSales: number;
	/**
	 * NEEDS A DECISION — answers "what must someone act on?". Every terminal row
	 * awaiting a human: conflicted + needs-revision + rejected.
	 */
	needsDecision: number;
	/**
	 * NEEDS A DECISION, the DEAD LETTERS alone (#832) — writes the server
	 * permanently refused. They are a subset of `needsDecision`, but they need
	 * their own number: a 409 conflict ("changed on the server while a till was
	 * editing") and a dead letter ("your server refused this and nothing will
	 * retry it") are different problems with different fixes, and lumping them
	 * made the callout lie about half of them.
	 */
	needsDecisionRejected: number;
	/**
	 * NEEDS A DECISION, the conflicted + needs-revision rows, observed
	 * independently from the rejected rows. With `needsDecisionRejected` this
	 * partitions `needsDecision`: every terminal row lands in exactly one.
	 */
	needsDecisionUnresolved: number;
};

export function observeQueueCounts(engine: RxdbSyncEngine): Observable<EngineMutationCounts> {
	return observeBinding(engine, ['orders']).pipe(
		switchMap((database) =>
			combineLatest([
				observeQueueRows(engine),
				database ? openCartRecordIds$(database) : of(new Set<string>()),
			]).pipe(
				map(([all, openCartRecordIds]) => {
					const rows = all.filter((row) =>
						(BACKLOG_QUEUE_STATUSES as readonly QueueRowStatus[]).includes(row.status)
					);
					const held = new Set(heldOpenCartMutations(rows, openCartRecordIds));
					const backlog = rows.filter((row) => !held.has(row));
					const needsDecisionRejected = all.filter(
						(row) => row.status === REJECTED_QUEUE_STATUSES[0]
					).length;
					const needsDecisionUnresolved = all.filter((row) =>
						(PARKED_QUEUE_STATUSES as readonly QueueRowStatus[]).includes(row.status)
					).length;
					return {
						syncBacklog: backlog.length,
						syncBacklogSales: new Set(
							backlog.filter((row) => row.collectionName === 'orders').map((row) => row.recordId)
						).size,
						needsDecision: needsDecisionRejected + needsDecisionUnresolved,
						needsDecisionRejected,
						needsDecisionUnresolved,
					};
				})
			)
		)
	);
}
