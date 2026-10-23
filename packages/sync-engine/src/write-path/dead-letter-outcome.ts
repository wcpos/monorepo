import type { drainMutationQueue, ScopeBound, SyncObserver } from '@wcpos/sync-core';

import { scopeBoundObserver } from '../scope-bound';

import type { SyncCollectionName } from '../collections/engine-collections';

/** A queue row the drain made durable as `status: 'rejected'`. */
export type DeadLetter = Awaited<ReturnType<typeof drainMutationQueue>>['rejected'][number];

/**
 * The log outcome of a dead letter (the queue row's own verdict is durable
 * before this runs), for one drain tick: the one coded row the cashier log
 * keeps for a catalogue dead letter. The drain's own `push.rejected` is only a
 * stamped attempt (`revertPending`); the outcome is emitted where it is known —
 * `queue.write.auto-reverted` when the revert lands, a `push.rejected` marked
 * `revertFailed` when it does not, or marked `revertSkipped` for a born-local
 * create (which never reverts) and for a dead letter the tick abandoned by
 * throwing before it could settle it. Each outcome is judged by the dead
 * letter's ticket: one landing after a store or cashier switch (A→B→A
 * included), or a settle during a pending switch, is dropped, and Store health
 * is the backstop.
 */
export type DeadLetterOutcomes = {
	/** The drain's observer: a catalogue `push.rejected` leaves stamped `revertPending`. */
	observe: SyncObserver;
	/** The dead letter is durable, so its outcome is owed (catalogue only). */
	owe(bound: ScopeBound, deadLetter: DeadLetter): void;
	/** After write-rejected: `revertSkipped`, or the revert → auto-reverted | `revertFailed`. */
	settle(mutationId: string, evidence: { bornLocalCreate: boolean }): void;
	/** The tick threw: every outcome still owed is `revertSkipped`. */
	abandon(): void;
};

/**
 * Catalogue collections whose refused change is reverted to server truth right
 * after it dead-letters (#1082). Orders never are: money stays out of this path.
 */
const AUTO_REVERT_COLLECTIONS: ReadonlySet<string> = new Set([
	'products',
	'variations',
	'customers',
	'coupons',
] satisfies SyncCollectionName[]);

export function deadLetterOutcomesForTick(deps: {
	diagnostics: SyncObserver;
	revert(mutationId: string): Promise<void>;
}): DeadLetterOutcomes {
	const owed = new Map<string, { log: SyncObserver; deadLetter: DeadLetter }>();
	const rejectionOutcome = (
		log: SyncObserver,
		{ mutation, status, reason, serverMessage }: DeadLetter,
		marker: 'revertFailed' | 'revertSkipped'
	) =>
		log({
			type: 'push.rejected',
			level: 'error',
			collection: mutation.collectionName,
			fields: {
				op: mutation.operation,
				recordId: mutation.recordId,
				mutationId: mutation.mutationId,
				...(status !== undefined ? { status } : {}),
				...(reason !== undefined ? { reason } : {}),
				...(serverMessage !== undefined ? { serverMessage } : {}),
				[marker]: true,
			},
		});
	return {
		observe: (event) =>
			deps.diagnostics(
				event.type === 'push.rejected' &&
					event.collection !== undefined &&
					AUTO_REVERT_COLLECTIONS.has(event.collection)
					? { ...event, fields: { ...event.fields, revertPending: true } }
					: event
			),
		owe: (bound, deadLetter) => {
			if (AUTO_REVERT_COLLECTIONS.has(deadLetter.mutation.collectionName))
				owed.set(deadLetter.mutation.mutationId, {
					log: scopeBoundObserver(bound, deps.diagnostics),
					deadLetter,
				});
		},
		settle: (mutationId, { bornLocalCreate }) => {
			const entry = owed.get(mutationId);
			if (entry === undefined) return;
			owed.delete(mutationId);
			const { log, deadLetter } = entry;
			const { mutation, status, reason, serverMessage } = deadLetter;
			// A refused BORN-LOCAL CREATE never auto-discards: #1082's revert means
			// "restore server truth", and a record the server refused to create has
			// none — `discard` would DESTROY the only copy of what the cashier typed
			// (#832 R7b is scoped to the cashier-confirmed Store health dialog, which
			// warns before deleting). It dead-letters like an order instead: Store
			// health lists the rejected row and "Send again" rebuilds the payload
			// from the kept resident.
			if (bornLocalCreate) {
				rejectionOutcome(log, deadLetter, 'revertSkipped');
				return;
			}
			// Reactive revert (#1082): a rejected catalog change is settled for the
			// cashier by restoring server truth, through the SAME discard machinery
			// Store Health uses — claim serialization, in-guard successor overlay
			// (a newer queued edit's resident value survives the restore; see the
			// `successors` merge in conflict-resolution.ts), barcode selectors,
			// tombstone when the server no longer has the record. A write() landing
			// exactly between that overlay's read and its upsert can still flash
			// server truth for a beat — accepted: the newer mutation's queue row
			// survives and the next drain re-decides the record either way.
			// A revert cut short by a store or cashier switch is stale, not failed:
			// `log` drops its outcome, success or failure, and the change stays
			// parked for Store health.
			void (async () => {
				try {
					await deps.revert(mutationId);
					log({
						type: 'queue.write.auto-reverted',
						level: 'error',
						collection: mutation.collectionName,
						message: serverMessage ?? reason ?? 'Rejected change reverted to server truth',
						fields: {
							collection: mutation.collectionName,
							recordId: mutation.recordId,
							mutationId,
							...(status !== undefined ? { status } : {}),
							...(reason !== undefined ? { reason } : {}),
							...(serverMessage !== undefined ? { serverMessage } : {}),
						},
					});
				} catch {
					// The revert failed: the rejected row stays parked for Store Health.
					rejectionOutcome(log, deadLetter, 'revertFailed');
				}
			})();
		},
		abandon: () => {
			// No revert ran for these, and no later drain revisits a dead letter, so
			// the outcome is owed here.
			for (const { log, deadLetter } of owed.values())
				rejectionOutcome(log, deadLetter, 'revertSkipped');
			owed.clear();
		},
	};
}
