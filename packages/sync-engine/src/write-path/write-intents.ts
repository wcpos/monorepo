/**
 * The write plane's intent layer (facade slice 4): `write(intent)` durable-
 * enqueue semantics per ADR 0018 — resolves when the mutation is IN the
 * per-scope queue, never when pushed; push outcomes are events. Ports the web
 * host's order write-intent semantics (apps/web/src/db/orderWriteIntents.ts,
 * kept until #430) behind the descriptor write facet, so the facade's
 * dispatch is the engine-internal analogue of createRegistryWriteReconcile.
 *
 * Only collections whose descriptor carries a `write` facet are writeable —
 * orders today (the sole collection with a push route AND an ack write-back
 * contract; the #438 registry's wider write-capable set is server-side
 * aspiration until the per-collection reconciles exist). `write()` on any
 * other collection is caller misuse: an exception (invariant 5).
 *
 * Same-record coalescing (#507, tightened by gate2 #516): the incoming intent
 * coalesces into the LAST (highest-seq) PENDING queue entry for the record —
 * and ONLY when that entry has never been claimed or pushed (`attempts === 0`).
 * Targeting anything but the last row would let a new edit jump the queue past
 * an interim edit (the executed R3 reordering); coalescing an ever-pushed row
 * under a fresh mutationId would replay an intent the server may already hold,
 * whose born-twice/dedupe guard then returns the EXISTING document and
 * silently discards the new payload (the executed R2 replay hole). Every
 * ineligible case queues BEHIND instead. Shapes: update∘update = one update
 * carrying the LATEST full-document snapshot; create∘update = still a create
 * (the server hasn't seen the record) with the latest snapshot;
 * anything∘delete = a delete. The coalesced entry keeps the ORIGINAL queue
 * position (`seq`), ORIGINAL `baseRevision`, and original `queuedAt`, but a
 * FRESH `mutationId` — the server replays by mutationId, so one is never
 * reused with a different payload.
 *
 * ANNIHILATION (#516 rules 2–3): a delete arriving at a record whose queued
 * work is a NEVER-PUSHED local chain (a pending create head plus any pending
 * successors, all `attempts === 0`, nothing claimed/terminal) cancels the
 * WHOLE chain — create + updates + delete → nothing is ever sent — and, because
 * the caller asked for deletion, REMOVES the local resident row. The facade
 * emits a terminal 'write-annihilated' event for the returned receipt
 * mutationId. If ANY link was ever claimed/pushed (the server may already hold
 * the create), nothing annihilates: the delete queues behind, its base
 * deferred to the drain-time re-stamp from the create ack's anchored revision.
 *
 * The coalesced SNAPSHOT is re-materialized, not taken from the intent:
 * `WriteIntent.payload` is by type an arbitrary PARTIAL object, so replacing
 * the prior payload with it would drop the earlier edit's fields. The
 * replacement payload layers the RESIDENT record's stored `payload` (the
 * local truth — producers insert/update the local row before enqueuing),
 * then the prior entry's payload (covers a producer that enqueued without
 * writing locally), then the incoming intent's payload. A prior DELETE
 * payload (`{id}`) is never layered — it is a tombstone, not a snapshot.
 *
 * Every transition applies through the queue's CONDITIONAL (CAS) operations
 * inside a bounded re-read/retry loop: `coalesceInto`/`removePending` refuse
 * when the prior row is no longer pending (claimed by the drain, or consumed
 * by a concurrent write) and the whole decision re-runs against the fresh
 * queue — a delete never annihilates a claimed create (it queues behind it,
 * base deferred to the drain-time re-stamp), and two concurrent writes can
 * never both coalesce onto one row.
 */

import {
	buildCreateMutation,
	buildDeleteMutation,
	buildUpdateMutation,
	RecordMutationQueue,
	RxRecordMutationStorage,
} from '@wcpos/sync-core';
import type {
	QueuedMutation,
	RecordMutation,
	RxRecordMutationCollection,
	SyncObserver,
} from '@wcpos/sync-core';

import {
	MUTATION_QUEUE_RXDB_COLLECTION,
	type SyncCollectionName,
} from '../collections/engine-collections';

import type { RxCollection, RxDatabase } from 'rxdb';

export type WriteIntent =
	| {
			collection: SyncCollectionName;
			operation: 'create';
			payload: Record<string, unknown>;
			recordId: string;
	  }
	| {
			collection: SyncCollectionName;
			operation: 'update';
			recordId: string;
			payload: Record<string, unknown>;
			baseRevision?: string;
	  }
	| {
			collection: SyncCollectionName;
			operation: 'delete';
			recordId: string;
			baseRevision?: string;
	  };

type MutationDoc = {
	incrementalModify(
		fn: (data: Record<string, unknown>) => Record<string, unknown>
	): Promise<unknown>;
	remove(): Promise<unknown>;
	toJSON(): Record<string, unknown>;
};

function collectionOf(db: RxDatabase, name: string): RxCollection {
	const collection = db.collections[name];
	if (!collection) throw new Error(`Engine scope database is missing collection "${name}"`);
	return collection;
}

const queues = new WeakMap<object, RecordMutationQueue>();
export function queueFor(db: RxDatabase): RecordMutationQueue {
	const existing = queues.get(db);
	if (existing) return existing;
	const queue = new RecordMutationQueue(
		new RxRecordMutationStorage(
			() =>
				collectionOf(db, MUTATION_QUEUE_RXDB_COLLECTION) as unknown as RxRecordMutationCollection
		)
	);
	queues.set(db, queue);
	return queue;
}

/**
 * Build + durably enqueue one intent against the ACTIVE scope database, and
 * mark the local record dirty (`local.pendingMutationIds` bookkeeping — the
 * pull-apply guard and the reset confirmation both key off it). Update/delete
 * require the record resident; update's baseRevision defaults to the record's
 * stored `sync.revision` (the same sourcing as the web host).
 */
export async function enqueueWriteIntent(input: {
	db: RxDatabase;
	intent: WriteIntent;
	mintUuid: () => string;
	now: () => string;
	observe?: SyncObserver;
}): Promise<{ mutationId: string; recordId: string; annihilated?: boolean }> {
	const { intent } = input;
	const deps = { mintUuid: input.mintUuid, now: input.now };
	const collection = collectionOf(input.db, intent.collection);
	const queue = queueFor(input.db);

	// Chain links a partial annihilation consumed before a CAS refusal forced a
	// re-decision: their queue rows are gone (superseded by this delete either
	// way), so the eventual dirty-mark must drop their ids from pendingMutationIds.
	const supersededIds = new Set<string>();

	// The bounded CAS retry loop: each iteration re-reads the queue, decides
	// (annihilate / coalesce / plain enqueue), and applies the decision through
	// the queue's CONDITIONAL transitions. A refused transition means the queue
	// moved mid-decision — a drain claimed the row, or a concurrent write()
	// consumed it — so the decision is stale and must be re-made against the
	// fresh queue, never forced through. Contention is microtask-scale, so the
	// bound is generous; hitting it means something is livelocking the queue.
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const rows = await queue.pending();
		const recordRows = rows.filter(
			(item) => item.collectionName === intent.collection && item.recordId === intent.recordId
		);
		const pendingRows = recordRows.filter(
			(item) => item.status === undefined || item.status === 'pending'
		);
		// The coalesce target (#516 rules 1–2): the LAST pending row, and only when
		// it has NEVER been claimed/pushed (attempts > 0 ⇒ the server may already
		// hold that exact mutation — a fresh-id replacement would replay into the
		// born-twice/dedupe guard with this edit's payload silently ignored).
		// Anything else — claimed, ever-pushed, terminal — makes the edit queue BEHIND.
		const lastPending = pendingRows.at(-1);
		const prior =
			lastPending !== undefined && (lastPending.attempts ?? 0) === 0 ? lastPending : undefined;
		// A create still ahead in the queue (pending or in flight): a delete queued
		// behind it defers its baseRevision to the drain-time re-stamp.
		const createAhead = recordRows.find(
			(item) =>
				item.operation === 'create' &&
				(item.status === undefined || item.status === 'pending' || item.status === 'claimed')
		);

		// never-pushed-chain ∘ delete = ANNIHILATION (#516 rules 2–3): the server
		// never saw the record, so nothing is sent — the WHOLE chain (create head +
		// pending successors + this delete) cancels, and the resident row is
		// removed (the caller asked for deletion). Preconditions: every row for the
		// record is pending with attempts === 0 (nothing claimed, ever-pushed, or
		// terminal). Removals are CONDITIONAL and run successors-first, the create
		// LAST: if the drain claims the create mid-annihilation the CAS refuses and
		// the decision re-runs (the delete then queues behind the in-flight
		// create); successors already removed are superseded by this delete either way.
		if (
			intent.operation === 'delete' &&
			pendingRows[0]?.operation === 'create' &&
			pendingRows.length === recordRows.length &&
			pendingRows.every((item) => (item.attempts ?? 0) === 0)
		) {
			let refused = false;
			const removed: QueuedMutation[] = [];
			for (const row of [...pendingRows].reverse()) {
				if (await queue.removePending(row.mutationId)) {
					removed.push(row);
					supersededIds.add(row.mutationId);
				} else {
					refused = true;
					break;
				}
			}
			if (refused) continue;
			const resident = (await collection.findOne(intent.recordId).exec()) as MutationDoc | null;
			if (resident) {
				try {
					await resident.remove();
				} catch (error) {
					// Restore through the queue mutex ahead of same-record work that
					// arrived while its dependency chain was absent.
					for (const row of removed) {
						supersededIds.delete(row.mutationId);
					}
					await queue.restoreAheadOfRecordNewcomers([...removed].reverse());
					throw error;
				}
			}
			input.observe?.({
				type: 'queue.write.annihilate',
				level: 'info',
				collection: intent.collection,
				fields: { recordId: intent.recordId, removed: removed.length },
			});
			// Terminal receipt: nothing will ever PUSH under this id — the facade
			// emits ONE 'write-annihilated' event for it (#516 rule 3).
			return { mutationId: input.mintUuid(), recordId: intent.recordId, annihilated: true };
		}

		// The resident row, fetched fresh per iteration: revision sourcing, the
		// coalesced-payload re-materialization, and the dirty-mark all read it.
		const doc = (await collection.findOne(intent.recordId).exec()) as MutationDoc | null;
		const stored = doc
			? (doc.toJSON() as { sync?: { revision?: string }; payload?: Record<string, unknown> })
			: undefined;

		let mutation: RecordMutation;
		if (intent.operation === 'create') {
			// A create must target a RESIDENT born-local row (the web contract): the
			// ack write-back reconciles the server id/revision ONTO that row — a
			// payload-only create would be acknowledged with nothing to reconcile.
			if (!doc) {
				throw new Error(
					`write(create): record "${intent.recordId}" is not resident in "${intent.collection}" — insert the born-local row first`
				);
			}
			mutation = buildCreateMutation(
				{
					collectionName: intent.collection,
					payload: intent.payload as never,
					currentId: intent.recordId,
				},
				deps
			);
		} else {
			if (!doc) {
				throw new Error(
					`write(${intent.operation}): record "${intent.recordId}" is not resident in "${intent.collection}"`
				);
			}
			const storedRevision = stored?.sync?.revision ?? '';
			if (intent.operation === 'update') {
				mutation = buildUpdateMutation(
					{
						collectionName: intent.collection,
						recordId: intent.recordId,
						payload: intent.payload as never,
						baseRevision: (intent.baseRevision ?? storedRevision) || null,
					},
					deps
				);
			} else {
				const baseRevision = intent.baseRevision ?? storedRevision;
				if (!baseRevision && !createAhead) {
					throw new Error(
						'write(delete): a baseRevision is required — the server 428s an unconditional delete'
					);
				}
				mutation = baseRevision
					? buildDeleteMutation(
							{ collectionName: intent.collection, recordId: intent.recordId, baseRevision },
							deps
						)
					: {
							// A delete queued behind a create still ahead in the queue (in
							// flight, or pending-but-ever-pushed) has no revision yet: the
							// create's ack will anchor one, and the drain re-stamps this
							// delete from `sync.revision` at push time. Defer the base rather
							// than reject the caller or annihilate maybe-applied work.
							mutationId: deps.mintUuid(),
							collectionName: intent.collection,
							operation: 'delete',
							recordId: intent.recordId,
							origin: 'existing',
							payload: { id: intent.recordId },
							baseRevision: null,
							queuedAt: deps.now(),
						};
			}
		}

		if (prior) {
			const operation = prior.operation === 'create' ? ('create' as const) : mutation.operation;
			// Re-materialize the coalesced SNAPSHOT (intent payloads are partial):
			// resident stored payload (local truth) ⊕ the prior entry's payload
			// (covers an enqueue that never wrote locally; a delete tombstone is
			// not a snapshot, so it never layers) ⊕ the incoming intent's payload.
			// A delete replacement stays the bare `{id}` tombstone.
			const payload =
				operation === 'delete'
					? mutation.payload
					: {
							...(stored?.payload ?? {}),
							...(prior.operation === 'delete' ? {} : prior.payload),
							...mutation.payload,
						};
			const replacement = {
				...mutation,
				operation,
				payload,
				baseRevision: prior.baseRevision,
				queuedAt: prior.queuedAt,
				seq: prior.seq,
				coalesced: (prior.coalesced ?? 0) + 1,
				status: 'pending' as const,
			};
			// Conditional swap: refuses when the prior row is no longer pending
			// (drain-claimed or consumed by a concurrent write) — re-decide then.
			if (!(await queue.coalesceInto(prior.mutationId, replacement))) continue;
			input.observe?.({
				type: 'queue.write.coalesce',
				level: 'info',
				collection: mutation.collectionName,
				fields: { recordId: mutation.recordId, removed: 1, added: 1 },
			});
		} else {
			await queue.enqueue(mutation);
		}

		// Dirty-mark the resident record (create may target a record inserted by the
		// caller beforehand; absent is fine for a payload-only create). Enqueue is
		// ATOMIC-BY-COMPENSATION: if this second write fails, the queue insert is
		// rolled back (and a coalesced-away prior restored) so `write()` rejecting
		// means "nothing changed". A future schema may derive the dirty state FROM
		// the durable queue and delete this second write (and the compensation)
		// entirely.
		if (doc) {
			try {
				await doc.incrementalModify((data) => {
					const local = (data.local ?? {}) as { dirty?: boolean; pendingMutationIds?: string[] };
					const pending = (
						Array.isArray(local.pendingMutationIds) ? local.pendingMutationIds : []
					).filter((id) => id !== prior?.mutationId && !supersededIds.has(id));
					return {
						...data,
						local: { ...local, dirty: true, pendingMutationIds: [...pending, mutation.mutationId] },
					};
				});
			} catch (error) {
				// CAS-CONDITIONAL compensation (#516 item 5): unwind ONLY a row the
				// drain has not touched. If the drain claimed the just-enqueued row in
				// the microtask window, it is in-flight work — deleting it would cancel
				// a push the server may be applying, and restoring `prior` would
				// resurrect a superseded intent alongside it. In that case adapt: leave
				// the queue as-is (the enqueue stands; only the dirty-mark is missing,
				// and the drain's ack/reject bookkeeping self-heals it) and rethrow.
				const unwound = await queue.removePending(mutation.mutationId);
				if (unwound && prior) await queue.replace(prior);
				throw error;
			}
		}

		return { mutationId: mutation.mutationId, recordId: mutation.recordId };
	}
	throw new Error(
		`write(${intent.operation}): the mutation queue kept changing under "${intent.recordId}" — retry the intent`
	);
}

/**
 * The BORN-TWICE honest reconcile (gate2 #516 item 1): a create acked HTTP 200
 * means the server's born-twice guard matched an EXISTING document and
 * DISCARDED the pushed payload (201 is the only "applied" create — see
 * `PushResult.httpStatus` for why that outcome code, not a document diff, is
 * the comparison). Re-land the discarded local snapshot as a follow-up UPDATE
 * so the edit still reaches the server:
 *
 *  - a queued DELETE for the record supersedes everything — no follow-up;
 *  - a coalescable successor (last pending row, never pushed) absorbs the
 *    snapshot UNDER its own payload (the successor is newer — its fields win
 *    on overlap), via the same fresh-mutationId CAS swap as coalescing;
 *  - otherwise a fresh tail update enqueues, carrying the snapshot layered
 *    UNDER every queued successor's payload (successors push first; on overlap
 *    their newer values must win server-side too), based on the ack's revision.
 *    The append is CONDITIONAL (`enqueueWhen`): it applies only if the
 *    record's row-set is unchanged inside the serialized turn, so a racing
 *    write() can never end up BELOW the older snapshot (#516 review P1).
 *
 * Called from the drain's applyAck BEFORE the create is acknowledged: every
 * failure path THROWS — including CAS exhaustion under a hot same-record
 * writer (#516 review P2) — so the ack fails, the create stays queued, and
 * the next drain replays it into the same guard; the coalesce arm above makes
 * the retry idempotent. Only a queued delete returns null (ack completes; the
 * snapshot is moot).
 */
export async function requeueBornTwiceSnapshot(input: {
	db: RxDatabase;
	/** The pushed create whose payload the server discarded. */
	mutation: RecordMutation;
	/** The ack's currentRevision — the EXISTING document's revision, the follow-up's base. */
	ackRevision: string | null;
	mintUuid: () => string;
	now: () => string;
	observe?: SyncObserver;
}): Promise<{ mutationId: string } | null> {
	const queue = queueFor(input.db);
	const { mutation } = input;
	const markBookkeeping = async (addId: string, dropId: string | null): Promise<void> => {
		const doc = (await collectionOf(input.db, mutation.collectionName)
			.findOne(mutation.recordId)
			.exec()) as MutationDoc | null;
		if (!doc) return;
		await doc.incrementalModify((data) => {
			const local = (data.local ?? {}) as { dirty?: boolean; pendingMutationIds?: string[] };
			const pending = (
				Array.isArray(local.pendingMutationIds) ? local.pendingMutationIds : []
			).filter((id) => id !== dropId);
			return { ...data, local: { ...local, dirty: true, pendingMutationIds: [...pending, addId] } };
		});
	};
	for (let attempt = 0; attempt < 10; attempt += 1) {
		const rows = (await queue.pending()).filter(
			(item) =>
				item.collectionName === mutation.collectionName &&
				item.recordId === mutation.recordId &&
				item.mutationId !== mutation.mutationId
		);
		// The record's fate is deletion — re-landing the snapshot would be undone anyway.
		if (rows.some((item) => item.operation === 'delete')) return null;
		const followUpId = input.mintUuid();
		const last = rows.at(-1);
		if (
			last &&
			(last.status === undefined || last.status === 'pending') &&
			(last.attempts ?? 0) === 0
		) {
			const replacement: QueuedMutation = {
				...last,
				mutationId: followUpId,
				payload: { ...mutation.payload, ...last.payload },
				coalesced: (last.coalesced ?? 0) + 1,
				status: 'pending',
			};
			if (!(await queue.coalesceInto(last.mutationId, replacement))) continue;
			await markBookkeeping(followUpId, last.mutationId);
			input.observe?.({
				type: 'queue.write.born-twice-requeue',
				level: 'warn',
				collection: mutation.collectionName,
				fields: {
					recordId: mutation.recordId,
					mutationId: mutation.mutationId,
					followUpMutationId: followUpId,
				},
			});
			return { mutationId: followUpId };
		}
		const payload = rows.reduce<Record<string, unknown>>(
			(acc, item) => ({ ...acc, ...item.payload }),
			{ ...mutation.payload }
		);
		// CONDITIONAL tail append (#516 review P1): the placement decision was made
		// on the `rows` read above — prove it still holds INSIDE the queue's
		// serialized turn. A concurrent write() landing between that read and this
		// append would sit at a LOWER seq than the follow-up, so the follow-up
		// (the OLDER snapshot, which also never layered that edit) would push
		// after it and overwrite its fields server-side. The precondition pins the
		// record's exact row-set (any concurrent enqueue adds an id; any coalesce
		// swaps one); on mismatch re-read and re-decide — the fresh row then
		// becomes a coalescable successor the snapshot merges UNDER.
		const observedIds = rows
			.map((item) => item.mutationId)
			.sort()
			.join('|');
		const queued = await queue.enqueueWhen(
			{
				mutationId: followUpId,
				collectionName: mutation.collectionName,
				operation: 'update',
				recordId: mutation.recordId,
				origin: 'existing',
				payload,
				baseRevision: input.ackRevision,
				queuedAt: input.now(),
			},
			(fresh) =>
				fresh
					.filter(
						(item) =>
							item.collectionName === mutation.collectionName &&
							item.recordId === mutation.recordId &&
							item.mutationId !== mutation.mutationId &&
							item.status !== 'rejected'
					)
					.map((item) => item.mutationId)
					.sort()
					.join('|') === observedIds
		);
		if (queued === null) continue;
		await markBookkeeping(followUpId, null);
		input.observe?.({
			type: 'queue.write.born-twice-requeue',
			level: 'warn',
			collection: mutation.collectionName,
			fields: {
				recordId: mutation.recordId,
				mutationId: mutation.mutationId,
				followUpMutationId: followUpId,
			},
		});
		return { mutationId: followUpId };
	}
	// Livelocked queue (#516 review P2): THROW rather than give up quietly — a
	// null return here would let applyAck COMPLETE, the drain would acknowledge
	// the create, and the discarded snapshot would silently vanish under
	// sustained same-record writes. Failing the ack keeps the create queued
	// (the docblock's promise): the next drain replays it into the same
	// born-twice guard and this reconcile re-runs against a quieter queue.
	throw new Error(
		`born-twice requeue: the mutation queue kept changing under "${mutation.recordId}" — create ack refused; the replay retries`
	);
}
