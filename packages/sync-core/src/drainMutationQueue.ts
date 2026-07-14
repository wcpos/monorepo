import { type SyncEvent, type SyncObserver } from './telemetry';
import {
	computeRetryBackoffMs,
	DEFAULT_RETRY_BACKOFF,
	type RetryBackoffPolicy,
	retryJitterSeed,
} from './recordRetryBackoff';

import type { RecordMutation } from './recordMutation';
import type { QueuedMutation, RecordMutationQueue } from './recordMutationQueue';
import type { PushResult } from './recordPushAdapter';

/**
 * The write-path drain (P1-1) — the orchestration that ties the model, the durable
 * queue, and the push adapter into a working write path: walk the pending mutations,
 * push each, and on success acknowledge the EXACT mutation (by `mutationId`, so an
 * edit that landed mid-push survives) and apply the server ack (reconcile the
 * server-assigned id onto the uuid-keyed record).
 *
 * It is pure orchestration: `push` is injected, so the host wires `pushRecordMutation`
 * with its endpoint resolver, scope guard (abort + epoch-drop), and telemetry. The
 * drain stays collection-agnostic and unit-testable.
 *
 * Lifecycle (#507): each mutation the drain attempts is first CLAIMED
 * (status 'claimed' — the write-intent layer never coalesces a claimed row)
 * with its `baseRevision` RE-STAMPED from the resident record's current
 * `sync.revision` (via the injected `currentRevision`; enqueue-time base as
 * the fallback) — so an edit queued behind an in-flight ack pushes against
 * the revision that ack just re-anchored instead of 409ing. Update/delete
 * only: a create has no base to re-anchor.
 *
 * Outcome handling, all idempotent (a re-drain re-pushes safely — the server dedupes
 * on `mutationId`; a stale 'claimed' row left by a crashed or aborted drain re-enters
 * the batch):
 *  - success → reconcile + acknowledge (removed from the queue);
 *  - 409 stale-revision conflict → transitions to durable status 'conflicted'
 *    with the server's `current` document + revision stored on the row, emits
 *    ONE `queue.write.conflict-transition`, and LEAVES the drain — no retries,
 *    no backoff churn; only an explicit resolution (engine.resolveConflict)
 *    moves it. Later mutations for the same record stay held while one of its
 *    mutations is conflicted;
 *  - 428 precondition required → ONE targeted `refreshRevision` + re-push with
 *    the observed revision; when no revision can be determined (no refresh
 *    port or refresh finds nothing) the row parks as durable status
 *    'needs-revision' (gate2 #516 item 4) — resolved only by an explicit
 *    resolution that first refreshes the revision, or a discard. If the one
 *    post-refresh retry still returns 428, it is dead-lettered rather than
 *    looped or parked on a revision already proven ineffective;
 *  - permanent 4xx → dead-lettered as durable status 'rejected' (persists for
 *    the conflicts() surface; leaves pending() so the record is syncable again);
 *  - error → back to 'pending' with backoff; left queued to retry next drain;
 *  - abort (scope switch) → the row STAYS durably 'claimed' (gate2 #516 item
 *    1): the push may have reached the server, so the intent is
 *    pushed-with-unknown-outcome — a claimed row never coalesces, which is
 *    exactly the guarantee an interrupted push needs. The next drain re-pushes
 *    it and the server dedupes on mutationId.
 */

export type DrainResult = {
	/** Mutations pushed + acknowledged this drain. */
	pushed: number;
	/** Push results that came back as 409 conflicts (durable 'conflicted' rows) or unrecoverable
	 * 428s (durable 'needs-revision' rows, synthesized here) — resolved via the engine's conflict surface. */
	conflicts: PushResult[];
	/** Mutations whose push threw a RETRYABLE error (5xx, network, in-progress) — left queued to retry. */
	failed: number;
	/** Mutations skipped this drain because their backoff window has not yet elapsed (ADR 0012). */
	deferred: number;
	/**
	 * Mutations that hit a NON-retryable client error (a 4xx that will never succeed —
	 * unsupported collection, validation) — DEAD-LETTERED: removed from the queue so they
	 * can't poison it, and surfaced here (+ a `push.rejected` event) for the host to log /
	 * alert / re-queue. Never retried automatically.
	 */
	rejected: RecordMutation[];
};

/** 4xx codes that ARE worth retrying — timeout, conflict/in-progress, too-early, rate-limit. */
const RETRYABLE_4XX = new Set([408, 409, 425, 429]);

/**
 * A thrown push error that will never succeed by retrying: either the adapter explicitly
 * classified it permanent (`RecordPushError.permanent`, e.g. a 409 `identity_ambiguous` whose
 * bare status would otherwise look transient), or its status is a permanent client error
 * (4xx, not in RETRYABLE_4XX).
 */
function isNonRetryable(error: unknown): boolean {
	const e = error as { status?: unknown; permanent?: unknown } | null;
	if (e?.permanent === true) return true;
	const status = e?.status;
	return typeof status === 'number' && status >= 400 && status < 500 && !RETRYABLE_4XX.has(status);
}

export async function drainMutationQueue(input: {
	queue: RecordMutationQueue;
	/** Pushes one mutation. The host wraps `pushRecordMutation` (endpoint, scope guard, telemetry). */
	push: (mutation: RecordMutation) => Promise<PushResult>;
	/**
	 * Apply the server ack for a successful push (reconcile id + write the document).
	 * Receives the abort signal so a scope-switch can cancel the ack write itself.
	 */
	applyAck?: (mutation: RecordMutation, result: PushResult, signal?: AbortSignal) => Promise<void>;
	limit?: number;
	signal?: AbortSignal;
	observe?: SyncObserver;
	/** Wall clock (ms epoch) for the backoff gate — injected for determinism. Default `Date.now`. */
	now?: () => number;
	/** Backoff curve for retryable failures. Default `DEFAULT_RETRY_BACKOFF`. */
	backoff?: RetryBackoffPolicy;
	/** Reads the resident record's latest server revision immediately before push. */
	currentRevision?: (mutation: RecordMutation) => Promise<string | null | undefined>;
	/** On a 428 precondition failure, performs one targeted server refresh and
	 * returns the record's newly observed revision. The drain retries once with
	 * that revision; a missing revision is parked as a conflict. */
	refreshRevision?: (mutation: RecordMutation) => Promise<string | null | undefined>;
}): Promise<DrainResult> {
	const emit = (event: SyncEvent): void => {
		try {
			input.observe?.(event);
		} catch {
			// best-effort: telemetry must never break the drain.
		}
	};

	const now = input.now ?? ((): number => Date.now());
	const backoff = input.backoff ?? DEFAULT_RETRY_BACKOFF;
	const limit = input.limit ?? Number.POSITIVE_INFINITY;
	// Scan the WHOLE pending set, not a pre-sliced page: `limit` bounds the number of push ATTEMPTS
	// (the network ops), not the scan — otherwise a deferred row at the head would consume a slot and
	// starve a ready row behind it. 'claimed' rows are INCLUDED: a claim outlives a tick when a crash
	// or an abort (scope switch) interrupted the push — pushed-with-unknown-outcome, deliberately kept
	// claimed so it can never coalesce (gate2 #516 item 1) — and re-pushing is safe: the server
	// dedupes on mutationId.
	const scanned = await input.queue.pending();
	const batch = scanned.filter(
		(mutation) =>
			mutation.status === undefined ||
			mutation.status === 'pending' ||
			mutation.status === 'claimed'
	);
	const conflicts: PushResult[] = [];
	// Records whose earlier mutation this drain did not cleanly push+ack. The queue
	// keeps a record's create/update/delete in order, so once one link doesn't land
	// we must NOT push later links for that record (an update before its create would
	// hit a non-existent row). They retry, in order, on the next drain. Seeded with
	// every record holding an unresolved 'conflicted' or 'needs-revision' row: pushing
	// a successor would hit the same stale/unknown base and multiply the conflict
	// instead of waiting for the caller's resolution.
	const blockedRecords = new Set<string>(
		scanned
			.filter(
				(mutation) => mutation.status === 'conflicted' || mutation.status === 'needs-revision'
			)
			.map((mutation) => mutation.recordId)
	);
	const rejected: RecordMutation[] = [];
	let pushed = 0;
	let failed = 0;
	let deferred = 0;
	let attempted = 0;

	// Bump the attempt count + set the backoff gate after a failed push OR a failed ack, so the next
	// drain waits before re-pushing (ADR 0012) — the same policy for both failure kinds.
	const applyBackoff = async (mutation: QueuedMutation): Promise<void> => {
		const attempts = (mutation.attempts ?? 0) + 1;
		const delayMs = computeRetryBackoffMs(attempts, backoff, retryJitterSeed(mutation.mutationId));
		try {
			await input.queue.reschedule({
				...mutation,
				attempts,
				nextAttemptAt: new Date(now() + delayMs).toISOString(),
			});
		} catch {
			// Couldn't persist the backoff — surface the rare double-fault (the push/ack failed AND the
			// reschedule write failed). The row keeps its prior gate, so the next drain re-pushes (without
			// this cycle's delay) and re-bumps; the bypass is at most one cycle.
			emit({
				type: 'queue.write.reschedule-failed',
				level: 'warn',
				collection: mutation.collectionName,
				fields: { recordId: mutation.recordId, mutationId: mutation.mutationId, attempts },
			});
		}
	};

	// An unrecoverable 428 (gate2 #516 item 4): the server demands a precondition
	// and no current revision could be determined. Park the row as durable
	// 'needs-revision' — an HONEST distinct state (no fake null-truth 'conflicted'
	// row, no same-base retry loop). Only an explicit resolution moves it:
	// retry-with-server-base first refreshes the revision; discard works as-is.
	const parkNeedsRevision = async (mutation: QueuedMutation): Promise<void> => {
		conflicts.push({
			outcome: 'conflict',
			mutation,
			document: null,
			currentRevision: null,
			conflict: { current: null, currentRevision: null },
		});
		await input.queue.replace({ ...mutation, status: 'needs-revision' });
		emit({
			type: 'queue.write.needs-revision',
			level: 'warn',
			collection: mutation.collectionName,
			fields: { recordId: mutation.recordId, mutationId: mutation.mutationId },
		});
		blockedRecords.add(mutation.recordId);
	};

	const deadLetter = async (mutation: QueuedMutation, error: unknown): Promise<void> => {
		rejected.push(mutation);
		emit({
			type: 'push.rejected',
			level: 'warn',
			collection: mutation.collectionName,
			fields: {
				recordId: mutation.recordId,
				mutationId: mutation.mutationId,
				status: (error as { status?: number }).status,
			},
		});
		try {
			await input.queue.replace({ ...mutation, status: 'rejected' });
		} catch {
			// couldn't mark it now — the next drain re-dead-letters it harmlessly.
		}
		blockedRecords.add(mutation.recordId);
	};

	for (const mutation of batch) {
		if (input.signal?.aborted) {
			break;
		}
		if (blockedRecords.has(mutation.recordId)) {
			continue;
		}
		// Backoff gate (ADR 0012): a mutation rescheduled after an earlier failure must wait until
		// its window elapses. Skip it AND hold later edits to the same record (FIFO ordering).
		if (mutation.nextAttemptAt && Date.parse(mutation.nextAttemptAt) > now()) {
			deferred += 1;
			blockedRecords.add(mutation.recordId);
			continue;
		}
		// `limit` caps push ATTEMPTS; the deferred/blocked rows handled above cost nothing against it.
		if (attempted >= limit) {
			break;
		}

		// Re-stamp the optimistic-concurrency base AT DRAIN TIME from the record's
		// current sync.revision (fallback: the enqueue-time base) — an update queued
		// while an earlier ack was in flight must push against the revision that ack
		// re-anchored. Creates keep their null base: there is nothing to re-anchor.
		const freshRevision =
			mutation.operation === 'create' ? undefined : await input.currentRevision?.(mutation);
		const draining = {
			...mutation,
			baseRevision: freshRevision || mutation.baseRevision,
			status: 'claimed' as const,
		};
		// CONDITIONAL durable claim BEFORE the push (CAS): from here until this row
		// settles, the write-intent layer refuses to coalesce it (an edit queues
		// behind it). If the row left the queue between the scan and this claim —
		// coalesced away or annihilated by a concurrent write intent — the claim
		// refuses and this drain SKIPS it (an unconditional upsert would resurrect
		// a row the write plane just removed and push a cancelled create).
		if (!(await input.queue.claim(draining))) {
			continue;
		}
		attempted += 1;
		let result: PushResult;
		try {
			result = await input.push(draining);
		} catch (error) {
			// An abort (scope switch) cancelled the push — NOT a real failure. Don't bump attempts,
			// back it off, or dead-letter a permanent error that raced with cancellation. The row
			// STAYS durably 'claimed' (gate2 #516 item 1): the push may have reached the server, so
			// this intent is pushed-with-unknown-outcome — a claimed row never coalesces, and the
			// next drain re-pushes it (the server dedupes on mutationId).
			if (input.signal?.aborted) {
				break;
			}
			if ((error as { status?: unknown } | null)?.status === 428) {
				// Precondition required — the SAME recovery for every operation, deletes
				// included (gate2 #516 item 4): one targeted revision refresh, one retry.
				if (!input.refreshRevision) {
					await parkNeedsRevision(draining);
					continue;
				}
				let revision: string | null | undefined;
				try {
					revision = await input.refreshRevision(draining);
				} catch {
					if (input.signal?.aborted) {
						break;
					}
					failed += 1;
					blockedRecords.add(mutation.recordId);
					await applyBackoff({ ...draining, status: 'pending' });
					continue;
				}
				if (revision) {
					const restamped = { ...draining, baseRevision: revision };
					try {
						result = await input.push(restamped);
					} catch (retryError) {
						if (input.signal?.aborted) {
							break;
						}
						if ((retryError as { status?: unknown } | null)?.status === 428) {
							// The targeted refresh produced a revision and the server still rejected
							// the one allowed retry. That revision has now been proven ineffective;
							// dead-letter instead of creating a same-base resolution loop.
							await deadLetter(restamped, retryError);
							continue;
						} else if (isNonRetryable(retryError)) {
							await deadLetter(restamped, retryError);
							continue;
						} else {
							failed += 1;
							blockedRecords.add(mutation.recordId);
							await applyBackoff({ ...restamped, status: 'pending' });
							continue;
						}
					}
				} else {
					await parkNeedsRevision(draining);
					continue;
				}
			} else if (isNonRetryable(error)) {
				// A permanent client error (4xx) — retrying forever would poison the queue.
				// Dead-letter it: durable status 'rejected' (leaves pending() so the record is
				// syncable again, persists for the conflicts() surface) + surface it here.
				await deadLetter(draining, error);
				continue;
			} else {
				// The push adapter already emitted push.error. Leave it queued; bump + back off (ADR 0012).
				failed += 1;
				blockedRecords.add(mutation.recordId);
				await applyBackoff({ ...draining, status: 'pending' });
				continue;
			}
		}

		if (result.outcome === 'conflict') {
			// Stale-revision 409: the terminal-until-resolved transition. Store the
			// server's truth ON the row (the engine's conflicts() surface), emit ONE
			// transition event, and leave the drain — no retry, no backoff churn.
			conflicts.push(result);
			const current = result.conflict?.current;
			await input.queue.replace({
				...draining,
				status: 'conflicted',
				...(current !== null && current !== undefined ? { conflictDocument: current } : {}),
				conflictRevision: result.conflict?.currentRevision ?? result.currentRevision,
			});
			emit({
				type: 'queue.write.conflict-transition',
				level: 'warn',
				collection: mutation.collectionName,
				fields: { recordId: mutation.recordId, mutationId: mutation.mutationId },
			});
			blockedRecords.add(mutation.recordId); // hold later edits to this record until it's resolved
			continue;
		}

		// A push that only RESOLVED after the scope was aborted must not write its ack
		// into a possibly-switched scope — discard it (the server already has it; the
		// next drain re-pushes and the server dedupes on mutationId). The row stays
		// 'claimed': it is DEFINITELY applied server-side, the last state that may
		// coalesce a new edit onto it.
		if (input.signal?.aborted) {
			break;
		}

		// Success: reconcile the server ack, THEN acknowledge the exact mutation. If the
		// ack-apply OR the durable removal throws, do NOT count it pushed — leave it
		// queued to retry (the re-push dedupes), and block later links for this record.
		try {
			await input.applyAck?.(draining, result, input.signal);
			// Re-check abort AFTER applyAck: the signal can abort WHILE applyAck awaits, and
			// acknowledging then would drop the mutation after cancellation (a TOCTOU). Leave
			// it queued (still 'claimed') — the next drain re-pushes and the server dedupes
			// on mutationId.
			if (input.signal?.aborted) {
				break;
			}
			await input.queue.acknowledge([mutation.mutationId]);
			pushed += 1;
		} catch {
			// The push landed but the ack/remove failed — leave it queued (the re-push dedupes), block
			// later links, and back it off so we don't hammer. An abort here is a scope switch, not a
			// failure, so skip the backoff.
			failed += 1;
			blockedRecords.add(mutation.recordId);
			if (!input.signal?.aborted) {
				await applyBackoff({ ...draining, status: 'pending' });
			}
		}
	}

	emit({
		type: 'queue.write.drain',
		level: 'info',
		fields: {
			scanned: batch.length,
			attempted,
			pushed,
			deferred,
			conflicts: conflicts.length,
			failed,
			rejected: rejected.length,
		},
	});
	return { pushed, conflicts, failed, deferred, rejected };
}
