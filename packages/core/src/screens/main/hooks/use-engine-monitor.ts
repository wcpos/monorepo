import * as React from 'react';

import { combineLatest, Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

import { useQueryRuntime } from '@wcpos/query';
import { MUTATION_QUEUE_RXDB_COLLECTION, SYNC_COLLECTION_NAMES } from '@wcpos/sync-engine';
import type { EngineStatus, RxdbSyncEngine, SyncCollectionName } from '@wcpos/sync-engine';

export type EngineCollectionCounts = Record<string, number>;
export type EngineMutationCounts = {
	/**
	 * Every queued outbound record, any collection — the "changes waiting to
	 * send" number. A product edit stuck on this device matters as much as a
	 * sale, so nothing gets a privileged sub-count (Paul, 2026-08-08).
	 */
	pending: number;
	/** Every terminal row awaiting a decision: conflicted + needs-revision + rejected. */
	conflicts: number;
	/**
	 * The DEAD LETTERS alone (#832) — writes the server permanently refused. They
	 * are a subset of `conflicts`, but they need their own number: a 409 conflict
	 * ("changed on the server while a till was editing") and a dead letter ("your
	 * server refused this and nothing will retry it") are different problems with
	 * different fixes, and lumping them made the callout lie about half of them.
	 */
	rejected: number;
	/** Conflicted + needs-revision rows, observed independently from rejected rows. */
	unresolvedConflicts: number;
};

type CountCollection = { count(): { $: Observable<number> } };
type EngineDatabase = NonNullable<ReturnType<RxdbSyncEngine['active']>>['database'];
type MutationCollection = {
	find(query: { selector: { status: { $in: string[] }; collectionName?: { $eq: string } } }): {
		$: Observable<readonly unknown[]>;
	};
};

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
						pending: 0,
						conflicts: 0,
						rejected: 0,
						unresolvedConflicts: 0,
					});
				const mutations = database.collections[
					MUTATION_QUEUE_RXDB_COLLECTION
				] as unknown as MutationCollection;
				// "Waiting to send" means exactly that: queued for the network, or in
				// flight. `conflicted`/`needs-revision` are waiting on a HUMAN, not on
				// the store, and each already has its own panel below the stat — so
				// counting them here both overstated the queue and double-reported the
				// same record in two places.
				const pendingSelector = {
					status: { $in: ['pending', 'claimed'] },
				};
				const pending$ = mutations.find({ selector: pendingSelector }).$;
				const conflicts$ = mutations.find({
					selector: { status: { $in: ['conflicted', 'needs-revision', 'rejected'] } },
				}).$;
				const rejected$ = mutations.find({ selector: { status: { $in: ['rejected'] } } }).$;
				const unresolvedConflicts$ = mutations.find({
					selector: { status: { $in: ['conflicted', 'needs-revision'] } },
				}).$;
				return combineLatest([pending$, conflicts$, rejected$, unresolvedConflicts$]).pipe(
					map(([pending, conflicts, rejected, unresolvedConflicts]) => ({
						pending: pending.length,
						conflicts: conflicts.length,
						rejected: rejected.length,
						unresolvedConflicts: unresolvedConflicts.length,
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
		pending: 0,
		conflicts: 0,
		rejected: 0,
		unresolvedConflicts: 0,
	});

	React.useEffect(() => {
		// RxDB mutation selectors are external subscriptions and must follow the active engine lifecycle.
		return subscribeToMutationCounts(engine, setCounts);
	}, [engine]);

	return counts;
}
