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
 *    the observed revision. A born-local CREATE with no refreshable server
 *    identity is permanently rejected; when no update/delete revision can be
 *    determined (no refresh port or refresh finds nothing), the row parks as durable status
 *    'needs-revision' (gate2 #516 item 4) — resolved only by an explicit
 *    resolution that first refreshes the revision, or a discard. If the one
 *    post-refresh retry still returns 428, it is dead-lettered rather than
 *    looped or parked on a revision already proven ineffective;
 *  - permanent 4xx → dead-lettered as durable status 'rejected' (persists for
 *    the conflicts() surface; leaves pending() so the record is syncable again).
 *    The server's verdict — status, code, message, and when — is written ONTO
 *    the row (#832) so the recovery surface can state WHY. The drain still never
 *    retries a dead letter: recovery is an explicit `resolveConflict` call that
 *    enqueues a FRESH row with the payload rebuilt from the current resident;
 *
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
	/**
	 * Never-pushed create→delete chains cancelled AT DRAIN TIME before any push
	 * (#1059) — the leader-side equivalent of enqueue-time annihilation. Counts
	 * whole chains annihilated (one per record), not individual rows removed.
	 */
	annihilated: number;
	/** Mutations deliberately left pending by the host's hold policy. */
	held: number;
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
	rejected: { mutation: QueuedMutation; status?: number; reason?: string }[];
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

/**
 * How long a drain claim is honoured before another window may steal it (task 43
 * follow-up). Comfortably longer than any single push (network timeouts are far
 * shorter), so a live drain never loses its row; short enough that a CRASHED
 * drain — one that never acked or rescheduled — frees the row within a minute.
 */
const DEFAULT_CLAIM_LEASE_MS = 60_000;

export function isNeverPushedChain(rows: readonly QueuedMutation[]): boolean {
	return (
		rows.length > 0 &&
		rows[0]?.operation === 'create' &&
		rows.every(
			(row) => (row.status === undefined || row.status === 'pending') && (row.attempts ?? 0) === 0
		)
	);
}

/**
 * LEADER-SIDE DRAIN ANNIHILATION (#1059): cancel a NEVER-PUSHED create→delete
 * chain BEFORE any of it is claimed or pushed, so a follower's create-then-void
 * of an order that never reached the server produces no phantom WooCommerce
 * order (order number consumed, hooks/emails/stock fired, then cancelled).
 *
 * This is the drain-time twin of the enqueue-time annihilation in
 * `enqueueWriteIntent` (#516 rules 2–3). On a single tab / Electron the acting
 * tab is the write-plane leader, so its `write(delete)` coalesces (canCoalesce)
 * and annihilates the pair AT ENQUEUE — by the time the drain runs the chain is
 * already gone and THIS pass is a no-op, never a double-annihilation. On web a
 * FOLLOWER's `write()` fresh-appends (its cross-tab `_rev` cache cannot CAS an
 * existing row — #1057), so the create and the delete both survive to the queue;
 * the single-writer LEADER, which alone drains, is the one place a cross-tab-safe
 * annihilation can happen, and it happens here.
 *
 * Precondition — identical in spirit to enqueue-time (attempts === 0, whole
 * chain pending, nothing ever pushed):
 *  - the record's ENTIRE non-rejected row-set is `pending` (no claimed /
 *    conflicted / needs-revision row — a create that may have reached the server
 *    must never be annihilated);
 *  - it is a create HEAD … delete TAIL chain (a re-create after the delete, i.e.
 *    a delete that is not the terminal op, is left for the normal drain);
 *  - every row has `attempts === 0` (a create that pushed then errored back to
 *    pending carries attempts > 0 — its delete is a REAL void of a REAL order and
 *    must push).
 *
 * Removals are CONDITIONAL and run successors-first, the create LAST, mirroring
 * the enqueue-time ordering: a refused CAS (the row moved under us) restores the
 * rows already removed and leaves the record to the normal drain, so a partial
 * annihilation can never strand an orphaned delete or — worse — a create with no
 * delete behind it. The resident is removed only after the whole chain is gone;
 * if that removal throws, the chain is restored and the record is left to drain
 * (net-neutral phantom, the pre-fix behaviour — never data loss).
 */
async function annihilateNeverPushedChains(input: {
	queue: RecordMutationQueue;
	removeResident?: (mutation: QueuedMutation, signal?: AbortSignal) => Promise<void>;
	signal?: AbortSignal;
	emit: (event: SyncEvent) => void;
}): Promise<number> {
	const pending = await input.queue.pending();
	const byRecord = new Map<string, QueuedMutation[]>();
	for (const row of pending) {
		const key = `${row.collectionName}\u0000${row.recordId}`;
		const bucket = byRecord.get(key);
		if (bucket) bucket.push(row);
		else byRecord.set(key, [row]);
	}
	let annihilated = 0;
	for (const rows of byRecord.values()) {
		if (input.signal?.aborted) break;
		// `pending()` already excludes 'rejected'; require every remaining row to be
		// pending (undefined ⇒ pending) — any claimed/conflicted/needs-revision row
		// means the create may be in flight or the record is blocked, so bail.
		const pendingRows = rows.filter((row) => row.status === undefined || row.status === 'pending');
		if (
			!isNeverPushedChain(rows) ||
			pendingRows.length < 2 ||
			pendingRows[pendingRows.length - 1]?.operation !== 'delete' ||
			pendingRows.length !== rows.length
		) {
			continue;
		}
		const removed: QueuedMutation[] = [];
		let refused = false;
		for (const row of [...pendingRows].reverse()) {
			if (await input.queue.removePending(row.mutationId)) removed.push(row);
			else {
				refused = true;
				break;
			}
		}
		// `removed` is delete-first … create-last; the restore wants seq order.
		const orderedRemoved = [...removed].reverse();
		if (refused) {
			if (orderedRemoved.length > 0)
				await input.queue.restoreAheadOfRecordNewcomers(orderedRemoved);
			continue;
		}
		const head = pendingRows[0];
		if (input.removeResident) {
			try {
				await input.removeResident(head, input.signal);
			} catch {
				// Could not remove the resident — put the chain back and let the normal
				// drain handle it (a net-neutral phantom, the pre-#1059 behaviour). Never
				// leave the record with removed queue rows AND a resident: that is the
				// lost sale this whole write path is built to prevent.
				await input.queue.restoreAheadOfRecordNewcomers(orderedRemoved);
				continue;
			}
		}
		annihilated += 1;
		input.emit({
			type: 'queue.write.annihilate',
			level: 'info',
			collection: head.collectionName,
			fields: { recordId: head.recordId, removed: removed.length, drain: true },
		});
	}
	return annihilated;
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
	/**
	 * Removes the local resident record when a never-pushed create→delete chain is
	 * annihilated at drain (#1059). Called with the chain's create head after its
	 * queue rows are gone, so the resident vanishes exactly as it would have under
	 * enqueue-time annihilation (the caller asked for deletion). Absent ⇒ queue-only
	 * annihilation (the model tests): the pushes are still cancelled, the resident is
	 * left to the host. Wired by the write-drain lane, which only ticks on the leader,
	 * so a follower never annihilates.
	 */
	removeResident?: (mutation: QueuedMutation, signal?: AbortSignal) => Promise<void>;
	/** Leaves matching mutations pending without claiming, retrying, or backing off. */
	shouldHold?: (mutation: QueuedMutation) => Promise<boolean>;
	/**
	 * This drain instance's id + how long its claim lease lasts (task 43 follow-up).
	 * With both set, a claim carries a stealable lease so two windows draining
	 * cannot both claim one row. Absent ⇒ no lease (single-process / legacy callers
	 * behave exactly as before).
	 */
	drainInstanceId?: string;
	claimLeaseMs?: number;
	/** On a 428 precondition failure, performs one targeted server refresh and
	 * returns the record's newly observed revision. The drain retries once with
	 * that revision; a missing revision parks update/delete, while an unrefreshable
	 * create is permanently rejected. */
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

	// LEADER-SIDE DRAIN ANNIHILATION (#1059): cancel never-pushed create→delete
	// chains BEFORE the scan, so an annihilated create is never claimed or pushed
	// (no phantom server order from a follower create+void). A no-op on
	// single-tab/Electron, where the pair was already annihilated at enqueue.
	const annihilated = input.signal?.aborted
		? 0
		: await annihilateNeverPushedChains({
				queue: input.queue,
				...(input.removeResident ? { removeResident: input.removeResident } : {}),
				...(input.signal ? { signal: input.signal } : {}),
				emit,
			});
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
	const rejected: DrainResult['rejected'] = [];
	let pushed = 0;
	let held = 0;
	let failed = 0;
	let deferred = 0;
	let attempted = 0;

	// LEASE FENCE (task 43): a settlement write is safe only while THIS drain still
	// holds the row's lease. If another window stole it — our push outlived the
	// lease — the stored row now carries the thief's `claimedBy` (or is gone, acked
	// by the thief). An unconditional reschedule/replace/ack here would overwrite,
	// delete, or RESURRECT the thief's row, so every settlement path checks this
	// first and no-ops when the lease is no longer ours. With no `drainInstanceId`
	// (single-process / legacy) there is no lease and this is always true — settle
	// exactly as before.
	const stillOwnLease = async (mutationId: string): Promise<boolean> => {
		if (input.drainInstanceId === undefined) return true;
		const row = (await input.queue.all()).find((item) => item.mutationId === mutationId);
		return row?.claimedBy === input.drainInstanceId;
	};

	// Bump the attempt count + set the backoff gate after a failed push OR a failed ack, so the next
	// drain waits before re-pushing (ADR 0012) — the same policy for both failure kinds.
	const applyBackoff = async (mutation: QueuedMutation): Promise<void> => {
		if (!(await stillOwnLease(mutation.mutationId))) return;
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
		if (!(await stillOwnLease(mutation.mutationId))) return;
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
		if (!(await stillOwnLease(mutation.mutationId))) return;
		const { status, reason, serverMessage } = error as {
			status?: number;
			reason?: string;
			serverMessage?: string;
		};
		try {
			// Persist the WHY ON the row (#832), not just in the event: the event is
			// long gone by the time anyone looks, and a dead letter with no stated
			// cause is a completed sale that vanished for no reason anyone can see.
			// `requeuedFrom` / `requeueCount` ride along untouched (the spread), so a
			// row that dead-letters AGAIN after a recovery still reports how many
			// recoveries it has already survived.
			await input.queue.replace({
				...mutation,
				status: 'rejected',
				...(status !== undefined ? { rejectedStatus: status } : {}),
				...(reason !== undefined ? { rejectedReason: reason } : {}),
				...(serverMessage !== undefined ? { rejectedMessage: serverMessage } : {}),
				rejectedAt: new Date(now()).toISOString(),
			});
			// Counted ONLY once the verdict is durable. A dead letter that exists
			// solely in this drain's return value is not a dead letter: `rejected`
			// feeds the drain log AND the Store health gate that mounts the recovery
			// panel, so counting an unpersisted one tells every surface the row was
			// dead-lettered while storage still holds it as claimed/pending — the row
			// is then invisible to recovery and to anyone reading the logs.
			rejected.push({ mutation, status, reason });
			// Emitted only once the verdict is DURABLE, for the same reason. The log
			// pipeline classifies `push.rejected` as a terminal rejection and the
			// health banner reads that classification, so emitting it on a failed
			// write would put the row back on the very surface this change exists to
			// keep honest — reporting a dead letter the queue does not hold.
			emit({
				type: 'push.rejected',
				level: 'warn',
				collection: mutation.collectionName,
				fields: {
					recordId: mutation.recordId,
					mutationId: mutation.mutationId,
					status,
					reason,
				},
			});
		} catch (error) {
			// LOUD, not swallowed (#832 follow-up). The previous bare `catch {}` is
			// how the 2026-08-06 dev-next smoke became undiagnosable: the drain
			// reported `rejected: 1`, the log agreed, and the durable row was still
			// pending — so the recovery panel never mounted and nothing anywhere said
			// why. The next drain does re-dead-letter the row (its claim is stale, so
			// it is re-claimable), but a failure that keeps recurring must be visible
			// rather than a silent retry loop.
			emit({
				type: 'push.dead-letter-unpersisted',
				level: 'error',
				collection: mutation.collectionName,
				message: `dead-letter verdict could not be written to the queue: ${
					error instanceof Error ? error.message : String(error)
				}`,
				fields: {
					recordId: mutation.recordId,
					mutationId: mutation.mutationId,
					status,
					reason,
				},
			});
			// Counted as a FAILURE and put behind the backoff gate. Without both, the
			// drain returns `failed: 0, rejected: 0` — a clean-looking tick — while
			// the row stays instantly re-claimable, so the write-drain lane retries it
			// every cycle and the error event repeats forever. This is a double fault
			// (the server refused it AND the queue would not record that), so it gets
			// the same treatment as any other failed write: visible, and slowed down.
			failed += 1;
			await applyBackoff(mutation);
		}
		blockedRecords.add(mutation.recordId);
	};

	// A drainable release row — an explicit mutation or a delete — must drain its
	// record's WHOLE chain in FIFO order. An already-attempted predecessor cannot
	// coalesce with the release, so holding it would starve the release behind
	// blockedRecords forever: a held row never retries, and the status transition
	// that would free it (checkout) is itself waiting on the release's push.
	const releaseRecords = new Set<string>(
		batch
			.filter((mutation) => mutation.explicit === true || mutation.operation === 'delete')
			.map((mutation) => mutation.recordId)
	);
	for (const mutation of batch) {
		if (input.signal?.aborted) {
			break;
		}
		if (blockedRecords.has(mutation.recordId)) {
			continue;
		}
		if (!releaseRecords.has(mutation.recordId) && (await input.shouldHold?.(mutation))) {
			held += 1;
			blockedRecords.add(mutation.recordId);
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
		// Never INHERIT a foreign lease: strip any `claimedBy`/`claimedUntil` the
		// scanned row carried before stamping our own (or none). Without this, a
		// caller with no `drainInstanceId` would spread a foreign holder into
		// `draining` and `claim()` would read it as its OWN claim, bypassing the
		// live-lease check (adversarial P2).
		const { claimedBy: _priorBy, claimedUntil: _priorUntil, ...bare } = mutation;
		const lease =
			input.drainInstanceId !== undefined
				? {
						claimedBy: input.drainInstanceId,
						claimedUntil: new Date(
							now() + (input.claimLeaseMs ?? DEFAULT_CLAIM_LEASE_MS)
						).toISOString(),
					}
				: {};
		const draining = {
			...bare,
			baseRevision: freshRevision || mutation.baseRevision,
			status: 'claimed' as const,
			...lease,
		};
		// CONDITIONAL durable claim BEFORE the push (CAS): from here until this row
		// settles, the write-intent layer refuses to coalesce it (an edit queues
		// behind it). If the row left the queue between the scan and this claim —
		// coalesced away or annihilated by a concurrent write intent — the claim
		// refuses and this drain SKIPS it (an unconditional upsert would resurrect
		// a row the write plane just removed and push a cancelled create). The lease
		// (task 43) additionally refuses a row another window is actively pushing.
		if (!(await input.queue.claim(draining, now()))) {
			// A row another window is actively pushing (live foreign lease) must also
			// HOLD this record's later mutations — otherwise we would skip the leased
			// predecessor and push a successor out of FIFO order (an update before its
			// create reaches the server). A row that is merely gone needs no block.
			const current = (await input.queue.all()).find(
				(item) => item.mutationId === mutation.mutationId
			);
			if (
				current?.status === 'claimed' &&
				current.claimedBy !== undefined &&
				current.claimedBy !== input.drainInstanceId &&
				(current.claimedUntil ? Date.parse(current.claimedUntil) : 0) > now()
			) {
				blockedRecords.add(mutation.recordId);
			}
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
				// Attempt the existing one-refresh, one-retry policy when a remote
				// identity exists. A born-local create has no such identity; the null
				// refresh result below makes its 428 a permanent rejection instead of
				// an unsettleable needs-revision row.
				if (!input.refreshRevision) {
					if (draining.operation === 'create') await deadLetter(draining, error);
					else await parkNeedsRevision(draining);
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
					// A born-local create has no remote identity, so refreshRevision
					// returns no revision without a request. It can never satisfy a 428
					// precondition through conflict resolution; reject it permanently.
					if (draining.operation === 'create') await deadLetter(draining, error);
					else await parkNeedsRevision(draining);
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

		// LEASE FENCE (task 43): the push (and any 428 refresh/retry) is where a slow
		// drain outlives its lease. Before recording the outcome — a conflict
		// transition, a born-twice follow-up, or the acknowledge that REMOVES the row
		// — confirm the lease is still ours. If a window stole it mid-push, the row is
		// theirs now (they will re-push and settle, the server deduping on
		// mutationId); recording our outcome would delete or resurrect their row.
		if (!(await stillOwnLease(mutation.mutationId))) {
			continue;
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
			annihilated,
			held,
			deferred,
			conflicts: conflicts.length,
			failed,
			rejected: rejected.length,
		},
	});
	return { pushed, annihilated, held, conflicts, failed, deferred, rejected };
}
