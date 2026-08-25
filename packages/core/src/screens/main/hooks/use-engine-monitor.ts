import * as React from 'react';

import { combineLatest, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { useQueryRuntime } from '@wcpos/query';
import {
	heldOpenCartMutations,
	MUTATION_QUEUE_RXDB_COLLECTION,
	OPEN_CART_ORDER_STATUS,
	SYNC_COLLECTION_NAMES,
} from '@wcpos/sync-engine';
import type {
	EngineStatus,
	HoldCandidate,
	RxdbSyncEngine,
	SyncCollectionName,
} from '@wcpos/sync-engine';

export type EngineCollectionCounts = Record<string, number>;

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

type CountCollection = { count(): { $: Observable<number> } };
type EngineDatabase = NonNullable<ReturnType<RxdbSyncEngine['active']>>['database'];
type QueueRow = HoldCandidate & { mutationId: string };
type MutationCollection = {
	find(query: { selector: { status: { $in: string[] }; collectionName?: { $eq: string } } }): {
		$: Observable<readonly { toJSON(): QueueRow }[]>;
	};
};
type OrderCollection = {
	find(query: { selector: { status: { $eq: string } } }): {
		$: Observable<readonly { toJSON(): { uuid?: string } }[]>;
	};
};

/**
 * The records a cart is currently open on. Live, because a checkout releases the
 * hold the instant the order leaves `pos-open` and the stat must follow it.
 */
function openCartRecordIds$(database: EngineDatabase): Observable<ReadonlySet<string>> {
	const orders = database.collections.orders as unknown as OrderCollection | undefined;
	if (!orders) return of(new Set<string>());
	return orders
		.find({ selector: { status: { $eq: OPEN_CART_ORDER_STATUS } } })
		.$.pipe(
			map(
				(documents) =>
					new Set(
						documents
							.map((document) => document.toJSON().uuid)
							.filter((uuid): uuid is string => uuid !== undefined)
					)
			)
		);
}

const EMPTY_COLLECTION_COUNTS = Object.fromEntries(
	SYNC_COLLECTION_NAMES.map((name) => [name, 0])
) as EngineCollectionCounts;

function subscribeToCollectionCounts(
	engine: RxdbSyncEngine,
	cb: (counts: EngineCollectionCounts) => void
): () => void {
	const subscription = new Observable<EngineDatabase | null>((subscriber) =>
		engine.db$((database) => subscriber.next(database))
	)
		.pipe(
			switchMap((database) => {
				if (!database) return of(EMPTY_COLLECTION_COUNTS);
				const collections = database.collections as unknown as Record<
					SyncCollectionName,
					CountCollection
				>;
				return combineLatest(SYNC_COLLECTION_NAMES.map((name) => collections[name].count().$)).pipe(
					map((values) =>
						Object.fromEntries(
							SYNC_COLLECTION_NAMES.map((name, index) => [name, values[index] ?? 0])
						)
					)
				);
			})
		)
		.subscribe(cb);
	return () => subscription.unsubscribe();
}

/**
 * Subscribe to the queue counts the health screens report, for the currently
 * active database.
 *
 * Every number here is ACTIONABLE by construction: the SYNC BACKLOG (the rows a
 * cashier is waiting on the store for) and NEEDS A DECISION (the rows waiting on
 * a human). Work the engine holds by design — an open cart's edits — belongs to
 * neither and is excluded, or the screens report a fault with nothing to act on
 * (#1546). UNSENT WORK — the third family, and the one a reset warns about —
 * counts those held rows and is computed elsewhere: `use-unsent-changes.ts`.
 */
function subscribeToMutationCounts(
	engine: RxdbSyncEngine,
	cb: (counts: EngineMutationCounts) => void
): () => void {
	const subscription = new Observable<EngineDatabase | null>((subscriber) =>
		engine.db$((database) => subscriber.next(database))
	)
		.pipe(
			switchMap((database) => {
				if (!database)
					return of({
						syncBacklog: 0,
						needsDecision: 0,
						needsDecisionRejected: 0,
						needsDecisionUnresolved: 0,
					});
				const mutations = database.collections[
					MUTATION_QUEUE_RXDB_COLLECTION
				] as unknown as MutationCollection;
				// "Waiting to send" means exactly that: queued for the network, or in
				// flight. `conflicted`/`needs-revision` are waiting on a HUMAN, not on
				// the store, and each already has its own panel below the stat — so
				// counting them here both overstated the queue and double-reported the
				// same record in two places.
				const syncBacklogSelector = {
					status: { $in: ['pending', 'claimed'] },
				};
				// An open cart's queued edits are held BY THE ENGINE until the sale
				// settles, so they are not waiting on the store either — and unlike a
				// conflict they have no panel: the cashier would read a red "1 change
				// waiting to send" with nothing anywhere to act on, while the change in
				// question was the cart open in front of them (#1546).
				const syncBacklog$ = combineLatest([
					mutations.find({ selector: syncBacklogSelector }).$,
					openCartRecordIds$(database),
				]).pipe(
					map(([documents, openCartRecordIds]) => {
						const rows = documents.map((document) => document.toJSON());
						return rows.length - heldOpenCartMutations(rows, openCartRecordIds).length;
					})
				);
				const needsDecision$ = mutations.find({
					selector: { status: { $in: ['conflicted', 'needs-revision', 'rejected'] } },
				}).$;
				const needsDecisionRejected$ = mutations.find({
					selector: { status: { $in: ['rejected'] } },
				}).$;
				const needsDecisionUnresolved$ = mutations.find({
					selector: { status: { $in: ['conflicted', 'needs-revision'] } },
				}).$;
				return combineLatest([
					syncBacklog$,
					needsDecision$,
					needsDecisionRejected$,
					needsDecisionUnresolved$,
				]).pipe(
					map(([syncBacklog, needsDecision, needsDecisionRejected, needsDecisionUnresolved]) => ({
						syncBacklog,
						needsDecision: needsDecision.length,
						needsDecisionRejected: needsDecisionRejected.length,
						needsDecisionUnresolved: needsDecisionUnresolved.length,
					}))
				);
			})
		)
		.subscribe(cb);
	return () => subscription.unsubscribe();
}

export function useEngineStatus(): EngineStatus {
	const { engine } = useQueryRuntime();
	const [status, setStatus] = React.useState<EngineStatus>(() => engine.status());

	React.useEffect(() => {
		// The engine owns this external subscription; bind it to the hook lifecycle.
		return engine.statusChanges(setStatus);
	}, [engine]);

	return status;
}

export function useCollectionCounts(): EngineCollectionCounts {
	const { engine } = useQueryRuntime();
	const [counts, setCounts] = React.useState<EngineCollectionCounts>(EMPTY_COLLECTION_COUNTS);

	React.useEffect(() => {
		// RxDB count streams are external subscriptions and must follow the active engine lifecycle.
		return subscribeToCollectionCounts(engine, setCounts);
	}, [engine]);

	return counts;
}

export function useMutationCounts(): EngineMutationCounts {
	const { engine } = useQueryRuntime();
	const [counts, setCounts] = React.useState<EngineMutationCounts>({
		syncBacklog: 0,
		needsDecision: 0,
		needsDecisionRejected: 0,
		needsDecisionUnresolved: 0,
	});

	React.useEffect(() => {
		// RxDB mutation selectors are external subscriptions and must follow the active engine lifecycle.
		return subscribeToMutationCounts(engine, setCounts);
	}, [engine]);

	return counts;
}
