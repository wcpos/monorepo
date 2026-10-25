import { type SyncEvent, type SyncObserver } from './telemetry';
import { diffConflictOverwrite } from './conflictOverwriteDiff';
import {
	computeRetryBackoffMs,
	DEFAULT_RETRY_BACKOFF,
	type RetryBackoffPolicy,
	retryJitterSeed,
} from './recordRetryBackoff';
import { toOrderWirePayload } from './woo/orderWriteContract';

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
 *    mutations is conflicted. ONE carve-out (`autoRecoverConflict`, #1204 —
 *    the host scopes it to orders): the FIRST 409 re-anchors the base from the
 *    409's own `currentRevision` and re-pushes the SAME intent once; only a
 *    SECOND consecutive conflict parks the row. See `autoRecoverConflict`;
 *  - 428 precondition required, on the first push or the #1204 re-push alike
 *    (one step, `refreshAndRepush`) → ONE targeted `refreshRevision` + re-push
 *    with the observed revision. A born-local CREATE with no refreshable server
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
 *  - error (any push attempt, or a 428's revision refresh) → back to 'pending'
 *    with backoff, reported to the row's waiter; left queued to retry next drain.
 *    A 401 also walls the rest of the pass: no user is logged in, so every push
 *    would get one;
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
	/**
	 * The individual queue rows those chains removed, in seq order (#1209). The
	 * chain is satisfied LOCALLY — nothing is sent — so every intent in it has a
	 * terminal outcome the caller may be awaiting, and on web the caller is
	 * usually a FOLLOWER tab that cannot see this drain at all. Without these the
	 * follower's `awaitWriteOutcome` for a voided never-pushed order waits out
	 * both its windows and the void's fallback never runs. The host turns each
	 * into one `write-annihilated`.
	 */
	annihilatedMutations: QueuedMutation[];
	/** Mutations deliberately left pending by the host's hold policy. */
	held: number;
	/** Push results that came back as 409 conflicts (durable 'conflicted' rows) or unrecoverable
	 * 428s (durable 'needs-revision' rows, synthesized here) — resolved via the engine's conflict surface. */
	conflicts: PushResult[];
	/** Mutations whose push threw a RETRYABLE error (5xx, network, in-progress) — left queued to retry. */
	failed: number;
	/** True when a push in this drain failed with 401; later rows were not pushed. */
	sessionExpired: boolean;
	/** Retryable push failures, whichever attempt met them (first push, 428 restamp or #1204 re-push). */
	failures: { mutation: QueuedMutation; status?: number; reason?: string }[];
	/** Mutations skipped this drain because their backoff window has not yet elapsed (ADR 0012). */
	deferred: number;
	/**
	 * Mutations that hit a NON-retryable client error (a 4xx that will never succeed —
	 * unsupported collection, validation) — DEAD-LETTERED: removed from the queue so they
	 * can't poison it, and surfaced here (+ a `push.rejected` event) for the host to log /
	 * alert / re-queue. Never retried automatically.
	 */
	rejected: {
		mutation: QueuedMutation;
		status?: number;
		reason?: string;
		serverMessage?: string;
		/** The server's error `data`, whole: a refusal may name what it refused (ADR 0040). */
		data?: Record<string, unknown>;
	}[];
};

// A 401 is a session failure, not a payload verdict; the queue drains after re-auth.
const SESSION_EXPIRED_STATUS = 401;

/** How one push attempt ended: a verdict to record, settled here, or cut off by an abort. */
type Settled = { kind: 'pushed'; result: PushResult } | { kind: 'settled' } | { kind: 'aborted' };

/**
 * The queue's record identity: a recordId is unique within its collection, not across
 * them, so every per-record set in a drain keys on both. Keying on recordId alone let
 * an orders row block — and, since the deferral work, mis-report — a products row that
 * happened to carry the same id.
 */
function recordKey(mutation: Pick<QueuedMutation, 'collectionName' | 'recordId'>): string {
	return `${mutation.collectionName}\u0000${mutation.recordId}`;
}

/** 4xx codes that ARE worth retrying — timeout, conflict/in-progress, too-early, rate-limit. */
const RETRYABLE_4XX = new Set([SESSION_EXPIRED_STATUS, 408, 409, 425, 429]);

/**
 * A thrown push error that will never succeed by retrying: either the adapter explicitly
 * classified it permanent (`RecordPushError.permanent`, e.g. a 409 `identity_ambiguous` whose
 * bare status would otherwise look transient), or its status is a permanent client error
 * (4xx, not in RETRYABLE_4XX).
 */
export function isNonRetryable(error: unknown): boolean {
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
			(row) =>
				row.supersededBy === undefined &&
				(row.status === undefined || row.status === 'pending') &&
				(row.attempts ?? 0) === 0
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
 * Successors are durably marked, never removed before resident deletion commits.
 * Refusal unmarks them; a crashed pre-commit fence expires back to the full chain.
 * After resident removal, marked rows are cleanup-only: recovery finishes the void.
 */
async function annihilateNeverPushedChains(input: {
	queue: RecordMutationQueue;
	now: () => number;
	currentRevision?: (mutation: RecordMutation) => Promise<string | null | undefined>;
	hasServerIdentity?: (mutation: RecordMutation) => Promise<boolean>;
	removeResident?: (mutation: QueuedMutation, signal?: AbortSignal) => Promise<void>;
	signal?: AbortSignal;
	emit: (event: SyncEvent) => void;
}): Promise<{ chains: number; mutations: QueuedMutation[] }> {
	const pending = await input.queue.pending();
	const byRecord = new Map<string, QueuedMutation[]>();
	for (const row of pending) {
		if ((await input.queue.admissionState(row, input.now())) !== 'released') continue;
		const key = recordKey(row);
		const bucket = byRecord.get(key);
		if (bucket) bucket.push(row);
		else byRecord.set(key, [row]);
	}
	let annihilated = 0;
	const annihilatedMutations: QueuedMutation[] = [];
	for (const rows of byRecord.values()) {
		if (input.signal?.aborted) break;
		// `pending()` already excludes 'rejected'; require every remaining row to be
		// pending (undefined ⇒ pending) — any claimed/conflicted/needs-revision row
		// means the create may be in flight or the record is blocked, so bail.
		const pendingRows = rows.filter((row) => row.status === undefined || row.status === 'pending');
		if (
			!isNeverPushedChain(rows) ||
			rows.some((row) => row.requeuedFrom) ||
			pendingRows.length < 2 ||
			pendingRows[pendingRows.length - 1]?.operation !== 'delete' ||
			pendingRows.length !== rows.length
		) {
			continue;
		}
		const head = pendingRows[0];
		const token = `drain-void:${input.now()}:${Math.random()}`;
		if (!(await input.queue.fenceForVoid(head.collectionName, head.recordId, token, input.now())))
			continue;
		const marked: QueuedMutation[] = [];
		let residentRemoved = false;
		try {
			if ((await input.currentRevision?.(head)) || (await input.hasServerIdentity?.(head)))
				continue;
			const fresh: QueuedMutation[] = [];
			let settlementRefused = false;
			for (const row of (await input.queue.all()).filter(
				(row) => recordKey(row) === recordKey(head)
			)) {
				if (
					row.status !== 'rejected' &&
					(await input.queue.admissionState(row, input.now())) === 'lost'
				) {
					if (
						!(await input.queue.markForAnnihilation(row.mutationId, token, input.now(), 'lost'))
					) {
						settlementRefused = true;
						break;
					}
					marked.push(row);
				} else fresh.push(row);
			}
			if (settlementRefused) continue;
			if (
				fresh.some(
					(row) =>
						row.status !== 'rejected' && !rows.some((own) => own.mutationId === row.mutationId)
				)
			)
				continue;
			for (const row of fresh.filter((row) => row.status === 'rejected')) {
				if (
					!(await input.queue.markForAnnihilation(row.mutationId, token, input.now(), 'rejected'))
				) {
					settlementRefused = true;
					break;
				}
				marked.push(row);
			}
			if (settlementRefused) continue;
			let refused = false;
			for (const row of [...pendingRows].reverse()) {
				if (await input.queue.markForAnnihilation(row.mutationId, token, input.now()))
					marked.push(row);
				else {
					refused = true;
					break;
				}
			}
			if (refused) continue;
			if ((await input.currentRevision?.(head)) || (await input.hasServerIdentity?.(head)))
				continue;
			if (!(await input.queue.setVoidPhase(head.collectionName, head.recordId, token, 'committed')))
				continue;
			if (input.removeResident) {
				try {
					await input.removeResident(head, input.signal);
				} catch {
					continue;
				}
			}
			residentRemoved = true;
			try {
				for (const row of marked) await input.queue.removeMarked(row.mutationId, token, true);
				await input.queue.releaseVoidFence(head.collectionName, head.recordId, token);
			} catch (error) {
				// The void committed; retain its fence for expiry recovery and report success.
				input.emit({
					type: 'void.cleanup-failed',
					level: 'warn',
					collection: head.collectionName,
					fields: { token, error: String(error) },
				});
			}
			annihilated += 1;
			// Failed cleanup is still durable in the committed fence; the lane acks after emitting.
			annihilatedMutations.push(
				...marked
					.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
					.map((row): QueuedMutation => ({ ...row, status: 'internal' }))
			);
			input.emit({
				type: 'queue.write.annihilate',
				level: 'info',
				collection: head.collectionName,
				fields: { recordId: head.recordId, removed: pendingRows.length, drain: true },
			});
		} finally {
			if (
				!residentRemoved &&
				(await input.queue.setVoidPhase(head.collectionName, head.recordId, token, 'preparing'))
			) {
				for (const row of marked) await input.queue.unmarkForAnnihilation(row.mutationId, token);
			}
			if (!residentRemoved)
				await input.queue.releaseVoidFence(head.collectionName, head.recordId, token);
		}
	}
	return { chains: annihilated, mutations: annihilatedMutations };
}

export async function drainMutationQueue(input: {
	queue: RecordMutationQueue;
	/**
	 * Pushes one mutation. The host wraps `pushRecordMutation` (endpoint, scope guard,
	 * telemetry). It receives the queued row, so `attempts` is there to stamp the push.
	 */
	push: (mutation: QueuedMutation) => Promise<PushResult>;
	/**
	 * Consecutive failures to RECORD a mutation's settlement locally — the
	 * backoff reschedule after a failed push, or the acknowledge after a good
	 * one — keyed `<kind>:<mutationId>`. Owned by the host so it outlives one
	 * drain: a failed reschedule leaves `attempts` unpersisted, so nothing in
	 * the queue row can count the streak. Omitted → counted per drain only.
	 */
	settleFailures?: Map<string, number>;
	/**
	 * Apply the server ack for a successful push (reconcile id + write the document).
	 * Receives the abort signal so a scope-switch can cancel the ack write itself.
	 */
	applyAck?: (mutation: RecordMutation, result: PushResult, signal?: AbortSignal) => Promise<void>;
	/** Called only after reconciliation and durable removal of this exact mutation succeed. */
	onAcknowledged?: (mutation: RecordMutation) => void;
	limit?: number;
	signal?: AbortSignal;
	observe?: SyncObserver;
	/** Wall clock (ms epoch) for the backoff gate — injected for determinism. Default `Date.now`. */
	now?: () => number;
	/** Backoff curve for retryable failures. Default `DEFAULT_RETRY_BACKOFF`. */
	backoff?: RetryBackoffPolicy;
	/** Reads the resident record's latest server revision immediately before push. */
	currentRevision?: (mutation: RecordMutation) => Promise<string | null | undefined>;
	/** Canonical server identity, including bare acknowledgements without a revision. */
	hasServerIdentity?: (mutation: RecordMutation) => Promise<boolean>;
	/**
	 * Removes the local resident record when a never-pushed create→delete chain is
	 * annihilated at drain (#1059). Called with the chain's create head after its
	 * queue rows are marked, so the resident vanishes exactly as it would have under
	 * enqueue-time annihilation (the caller asked for deletion). Absent ⇒ queue-only
	 * annihilation (the model tests): the pushes are still cancelled, the resident is
	 * left to the host. Wired by the write-drain lane, which only ticks on the leader,
	 * so a follower never annihilates.
	 */
	removeResident?: (mutation: QueuedMutation, signal?: AbortSignal) => Promise<void>;
	/** Leaves matching mutations pending without claiming, retrying, or backing off. */
	shouldHold?: (mutation: QueuedMutation) => Promise<boolean>;
	/**
	 * The host already knows the store refused this session (401). Records without a fresh
	 * explicit row are deferred without a push. A record with a fresh explicit row still
	 * gets its attempt, so a cashier's new action probes the session.
	 */
	sessionExpired?: boolean;
	/** A restored session gets one immediate attempt through existing retry delays. */
	retryImmediately?: boolean;
	/**
	 * Called the moment a push fails retryably — before the drain moves on to the
	 * next row — and again for every later row of the same record this drain then
	 * skips behind it (FIFO), carrying the head's status. A waiter on a 401 must
	 * hear about it now, not after the rest of the queue has been tried.
	 */
	onRetryableFailure?: (failure: DrainResult['failures'][number]) => void;
	/**
	 * Called the moment a dead letter is DURABLE, with the same entry `rejected`
	 * returns. A host that owes a verdict per dead letter must hear of it here:
	 * if a later step of this drain throws, the return value never arrives.
	 */
	onRejected?: (rejection: DrainResult['rejected'][number]) => void;
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
	/**
	 * ORDER WRITE-CONFLICT AUTO-RECOVERY (#1204, ruled 2026-08-14). Returns true
	 * for the mutations allowed ONE automatic recovery attempt before the durable
	 * 'conflicted' park. The host scopes it — today `collectionName === 'orders'`
	 * — and every other collection keeps the engine's "no auto-resolution"
	 * invariant untouched.
	 *
	 * WHY. A 409 `woo_rxdb_sync_conflict` parks the row terminally: later writes
	 * to that record are held forever, the only resolution surface is Store
	 * health (which a FOLLOWER tab refuses outright), and the cashier gets a bare
	 * "Failed to save order". The 409s that actually happen to an open order are
	 * not a competing edit — an open cart is single-writer in practice (the till
	 * owns it and the write plane is leader-serialized), so the drift is
	 * server-side bookkeeping churn (see #1204: a refused delete rewrote
	 * `_reduced_stock` and moved the order's canonical revision). The 409 body
	 * already carries the server's `currentRevision`, so the client can re-anchor
	 * without a fetch.
	 *
	 * WHAT IT DOES — and, as importantly, does NOT do. The base revision is
	 * re-stamped from the 409's `currentRevision` and the SAME local intent is
	 * pushed again. The server's `current` document is NOT adopted over the local
	 * record: for a POS the local cart is the cashier's live sale, and discarding
	 * it to take server truth would be a lost sale. After successful recovery the
	 * first 409 document is compared with the payload and any overwritten fields
	 * are logged. This diagnostic does not prevent or alter the re-push. The
	 * save-time money mirror (`order-money-divergence`, #1033) also
	 * fires on the ack exactly as before — and a SECOND consecutive conflict
	 * parks the row with the fresher server truth, byte-for-byte the pre-#1204
	 * behaviour. The recovery is bounded per attempt-pair, so a record the server
	 * conflicts every time still parks on its first drain rather than looping.
	 */
	autoRecoverConflict?: (mutation: RecordMutation) => boolean;
	/** Reconcile server line identity before the automatic retry, without adopting values. */
	reconcileConflict?: (mutation: RecordMutation, current: Record<string, unknown>) => Promise<void>;
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

	const recovered = input.signal?.aborted
		? []
		: await input.queue.recoverAnnihilatedMutations(now());

	// LEADER-SIDE DRAIN ANNIHILATION (#1059): cancel never-pushed create→delete
	// chains BEFORE the scan, so an annihilated create is never claimed or pushed
	// (no phantom server order from a follower create+void). A no-op on
	// single-tab/Electron, where the pair was already annihilated at enqueue.
	const annihilation = input.signal?.aborted
		? { chains: 0, mutations: [] as QueuedMutation[] }
		: await annihilateNeverPushedChains({
				queue: input.queue,
				now,
				currentRevision: input.currentRevision,
				hasServerIdentity: input.hasServerIdentity,
				...(input.removeResident ? { removeResident: input.removeResident } : {}),
				...(input.signal ? { signal: input.signal } : {}),
				emit,
			});
	const annihilated =
		annihilation.chains +
		new Set(recovered.map((row) => `${row.collectionName}/${row.recordId}`)).size;
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
				(mutation) =>
					mutation.supersededBy !== undefined ||
					mutation.status === 'conflicted' ||
					mutation.status === 'needs-revision'
			)
			.map(recordKey)
	);
	const rejected: DrainResult['rejected'] = [];
	const failures: DrainResult['failures'] = [];
	// Records whose head failed retryably THIS drain, with that failure: later rows of
	// the record are FIFO-blocked behind it and are reported with the same verdict.
	const blockedByFailure = new Map<string, { status?: number; reason?: string }>();
	const reportFailure = (failure: DrainResult['failures'][number]): void => {
		failures.push(failure);
		input.onRetryableFailure?.(failure);
	};
	let pushed = 0;
	let held = 0;
	let failed = 0;
	let deferred = 0;
	let attempted = 0;
	let sessionWall: { status?: number; reason?: string } | undefined;

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
	const settleFailures = input.settleFailures ?? new Map<string, number>();
	const noteSettleFailure = (kind: 'ack' | 'reschedule', mutationId: string): number => {
		const key = `${kind}:${mutationId}`;
		const streak = (settleFailures.get(key) ?? 0) + 1;
		settleFailures.set(key, streak);
		return streak;
	};
	let attemptStartedAt: number | undefined;
	const applyBackoff = async (mutation: QueuedMutation): Promise<void> => {
		if (!(await stillOwnLease(mutation.mutationId))) return;
		const attempts = (mutation.attempts ?? 0) + 1;
		const delayMs = computeRetryBackoffMs(attempts, backoff, retryJitterSeed(mutation.mutationId));
		try {
			await input.queue.reschedule({
				...mutation,
				attempts,
				// The release compares attempt start with the cashier's press; an in-flight press is not already tried.
				nextAttemptAt: new Date((attemptStartedAt ?? now()) + delayMs).toISOString(),
			});
			settleFailures.delete(`reschedule:${mutation.mutationId}`);
		} catch {
			// Couldn't persist the backoff — surface the rare double-fault (the push/ack failed AND the
			// reschedule write failed). The row keeps its prior gate, so the next drain re-pushes (without
			// this cycle's delay) and re-bumps; the bypass is at most one cycle.
			emit({
				type: 'queue.write.reschedule-failed',
				level: 'warn',
				collection: mutation.collectionName,
				fields: {
					recordId: mutation.recordId,
					mutationId: mutation.mutationId,
					attempts,
					consecutiveFailures: noteSettleFailure('reschedule', mutation.mutationId),
				},
			});
		}
	};

	// A dead letter whose every field the server has since ACCEPTED in a later write of
	// the same record has nothing left to recover: a requeue would subtract all of it
	// (`fieldsOwnedByLiveRows`, the same rule read against an accepted row instead of a
	// live one), and the hold it keeps on the checkout is stale — the till's own retry
	// IS the resolution. Settle it here, where the ack is known, as 'superseded-by-ack'.
	// `meta_data` never counts (no recovery takes it from a dead letter). A refused
	// DELETE is a statement about existence, not fields, and stays. A dead letter still
	// carrying a field the accepted write omitted (a refused completion's `status` under
	// a plain re-sync, which ADR 0040 strips) keeps that intent and stays listed. "Carried"
	// means ON THE WIRE (`sentFields`): the push adapter's sanitizers drop fields the queue
	// row still holds — a refused `status: 'completed'` queued again is stripped before it is
	// sent, so reading the row's payload would count a field the server never saw.
	const settleSupersededDeadLetters = async (
		acked: QueuedMutation,
		result: PushResult
	): Promise<void> => {
		if (acked.operation === 'delete') return;
		// A born-twice create (gate2 #516 item 1): 200, not 201, means the uuid already
		// existed and the server IGNORED this payload — nothing was accepted, and the write
		// lane's follow-up update is the write whose ack may settle the record's dead letters.
		if (acked.operation === 'create' && result.httpStatus === 200) return;
		// Wire against wire. The till queues the WHOLE resident payload (`total`,
		// `payment_method`, `date_paid`…) and the adapter strips the server-authored and
		// server-owned fields from every push — the refused one as much as the accepted
		// one — so the dead letter is judged by what IT sent, never by its raw row (the
		// first cut did that and settled nothing: #2939 live on 2026-10-25). Catalogue rows
		// keep their raw keys: their adapter maps rename fields, which only makes this
		// stricter, and they auto-discard anyway (#1082).
		const onWire = (row: QueuedMutation): string[] =>
			Object.keys(
				row.collectionName === 'orders'
					? toOrderWirePayload(row.payload ?? {})
					: (row.payload ?? {})
			);
		const accepted = new Set(result.sentFields ?? onWire(acked));
		let rows: QueuedMutation[];
		try {
			rows = await input.queue.all();
		} catch {
			return; // the ack is durable; a dead letter it could not read stays for Store health
		}
		for (const row of rows) {
			if (
				row.status !== 'rejected' ||
				row.operation === 'delete' ||
				row.mutationId === acked.mutationId ||
				recordKey(row) !== recordKey(acked)
			)
				continue;
			const carried = onWire(row).filter((key) => key !== 'meta_data');
			if (!carried.every((key) => accepted.has(key))) continue;
			let settled = false;
			try {
				// CAS: a Store health resolution racing this settles exactly once either way.
				settled = await input.queue.removeIfStatus(row.mutationId, 'rejected');
			} catch {
				settled = false;
			}
			if (!settled) continue;
			emit({
				type: 'queue.write.resolve',
				level: 'info',
				collection: row.collectionName,
				fields: {
					recordId: row.recordId,
					mutationId: row.mutationId,
					resolution: 'superseded-by-ack',
					supersededBy: acked.mutationId,
				},
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
		blockedRecords.add(recordKey(mutation));
	};

	const deadLetter = async (mutation: QueuedMutation, error: unknown): Promise<void | false> => {
		if (!(await stillOwnLease(mutation.mutationId))) return;
		const { status, reason, serverMessage, data } = error as {
			status?: number;
			reason?: string;
			serverMessage?: string;
			data?: Record<string, unknown>;
		};
		let rejection: DrainResult['rejected'][number] | undefined;
		try {
			// Persist the WHY ON the row (#832), not just in the event: the event is
			// long gone by the time anyone looks, and a dead letter with no stated
			// cause is a completed sale that vanished for no reason anyone can see.
			// `requeuedFrom` / `requeueCount` ride along untouched (the spread), so a
			// row that dead-letters AGAIN after a recovery still reports how many
			// recoveries it has already survived.
			const rejectedRow: QueuedMutation = {
				...mutation,
				status: 'rejected',
				...(status !== undefined ? { rejectedStatus: status } : {}),
				...(reason !== undefined ? { rejectedReason: reason } : {}),
				...(serverMessage !== undefined ? { rejectedMessage: serverMessage } : {}),
				rejectedAt: new Date(now()).toISOString(),
			};
			if (reason === 'admission-lost') {
				if (!(await input.queue.claim(rejectedRow, now()))) return false;
			} else await input.queue.replace(rejectedRow);
			// Counted ONLY once the verdict is durable. A dead letter that exists
			// solely in this drain's return value is not a dead letter: `rejected`
			// feeds the drain log AND the Store health gate that mounts the recovery
			// panel, so counting an unpersisted one tells every surface the row was
			// dead-lettered while storage still holds it as claimed/pending — the row
			// is then invisible to recovery and to anyone reading the logs.
			rejection = { mutation, status, reason, serverMessage, ...(data ? { data } : {}) };
			rejected.push(rejection);
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
					// Diagnostic context: which operation the server refused.
					op: mutation.operation,
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
		// Told only once the dead letter is durable AND announced, and outside the
		// persistence try: a throwing host callback is not a failed queue write, so
		// it must never be reported as one or put the settled row behind backoff.
		if (rejection !== undefined && input.onRejected) {
			try {
				input.onRejected(rejection);
			} catch (error) {
				emit({
					type: 'engine.listener-error',
					level: 'debug',
					collection: mutation.collectionName,
					message: `drain onRejected callback threw: ${
						error instanceof Error ? error.message : String(error)
					}`,
					fields: { recordId: mutation.recordId, mutationId: mutation.mutationId },
				});
			}
		}
		blockedRecords.add(recordKey(mutation));
	};

	// ONE ATTEMPT, one owner per rule. The first push and the #1204 re-anchored
	// re-push both run `attempt`, so a 428 buys the same refresh (`refreshAndRepush`,
	// one per push it re-anchors) and a throw settles the same way (`settleThrown`)
	// whichever push met it.
	const attempt = async (row: QueuedMutation, prepare?: () => Promise<void>): Promise<Settled> => {
		try {
			await prepare?.();
			return { kind: 'pushed', result: await input.push(row) };
		} catch (error) {
			// An abort (scope switch) cancelled the push — NOT a real failure. Don't bump attempts,
			// back it off, or dead-letter a permanent error that raced with cancellation. The row
			// STAYS durably 'claimed' (gate2 #516 item 1): the push may have reached the server, so
			// this intent is pushed-with-unknown-outcome — a claimed row never coalesces, and the
			// next drain re-pushes it (the server dedupes on mutationId).
			if (input.signal?.aborted) return { kind: 'aborted' };
			if ((error as { status?: unknown } | null)?.status === 428) {
				return refreshAndRepush(row, error);
			}
			await settleThrown(row, error);
			return { kind: 'settled' };
		}
	};

	// The 428 rule, in one place: ONE targeted refresh, then ONE re-push with the
	// observed revision. No revision (no refresh port, or a born-local create with no
	// remote identity to refresh against) settles terminally: a create can never
	// satisfy the precondition, so it is rejected; an update/delete parks.
	const refreshAndRepush = async (row: QueuedMutation, error: unknown): Promise<Settled> => {
		let revision: string | null | undefined;
		try {
			revision = await input.refreshRevision?.(row);
		} catch (refreshError) {
			if (input.signal?.aborted) return { kind: 'aborted' };
			// Never a dead letter: a failed refresh says nothing about the write itself.
			await defer(row, refreshError);
			return { kind: 'settled' };
		}
		if (!revision) {
			if (row.operation === 'create') await deadLetter(row, error);
			else await parkNeedsRevision(row);
			return { kind: 'settled' };
		}
		const restamped = { ...row, baseRevision: revision };
		try {
			return { kind: 'pushed', result: await input.push(restamped) };
		} catch (retryError) {
			if (input.signal?.aborted) return { kind: 'aborted' };
			// A second 428 proves the refreshed revision ineffective; isNonRetryable
			// treats 428 as terminal, so it dead-letters instead of looping on that base.
			await settleThrown(restamped, retryError);
			return { kind: 'settled' };
		}
	};

	// A retryable failure, settled in one place: the row stays queued behind backoff
	// (ADR 0012) and its waiter hears now, whichever attempt met it. A 401 also walls
	// the pass: it is a session fact, not this row's.
	const defer = async (row: QueuedMutation, error: unknown): Promise<void> => {
		failed += 1;
		const { status, reason } = (error ?? {}) as { status?: number; reason?: string };
		reportFailure({ mutation: row, status, reason });
		blockedByFailure.set(recordKey(row), { status, reason });
		blockedRecords.add(recordKey(row));
		await applyBackoff({ ...row, status: 'pending' });
		if (status === SESSION_EXPIRED_STATUS) sessionWall = { status, reason };
	};

	// A thrown push: a permanent 4xx is dead-lettered (retrying forever would poison
	// the queue); anything else is deferred (the push adapter already emitted push.error).
	const settleThrown = (row: QueuedMutation, error: unknown): Promise<void | false> =>
		isNonRetryable(error) ? deadLetter(row, error) : defer(row, error);

	// A drainable release row — an explicit mutation or a delete — must drain its
	// record's WHOLE chain in FIFO order. An already-attempted predecessor cannot
	// coalesce with the release, so holding it would starve the release behind
	// blockedRecords forever: a held row never retries, and the status transition
	// that would free it (checkout) is itself waiting on the release's push.
	const releaseRecords = new Set<string>(
		batch
			.filter((mutation) => mutation.explicit === true || mutation.operation === 'delete')
			.map(recordKey)
	);
	// A new cashier action gets one immediate attempt through its record's backoff: keyed by the
	// newest never-attempted explicit row's queue time, and spent once the chain has been tried
	// since then (below). Otherwise a head that keeps failing would keep the release fresh and
	// the chain would retry on every drain.
	const freshExplicitQueuedAt = new Map<string, number>();
	for (const mutation of batch) {
		if (mutation.explicit !== true || (mutation.attempts ?? 0) !== 0) continue;
		const key = recordKey(mutation);
		const queuedAt = Date.parse(mutation.queuedAt);
		// A queue time ahead of the drain clock (the clock stepped back) releases nothing, so a
		// skewed clock can only miss the release, never repeat it on every drain.
		if (!(queuedAt <= now())) continue;
		freshExplicitQueuedAt.set(key, Math.max(queuedAt, freshExplicitQueuedAt.get(key) ?? -Infinity));
	}
	// When a backing-off row's last attempt started: its gate minus the deterministic delay that set it.
	const lastAttemptAt = (mutation: QueuedMutation): number =>
		Date.parse(mutation.nextAttemptAt!) -
		computeRetryBackoffMs(mutation.attempts ?? 0, backoff, retryJitterSeed(mutation.mutationId));
	for (const mutation of batch) {
		attemptStartedAt = undefined;
		if (input.signal?.aborted) {
			break;
		}
		if (blockedRecords.has(recordKey(mutation))) {
			const wall = blockedByFailure.get(recordKey(mutation));
			if (wall) reportFailure({ mutation, ...wall });
			continue;
		}
		if (!releaseRecords.has(recordKey(mutation)) && (await input.shouldHold?.(mutation))) {
			held += 1;
			blockedRecords.add(recordKey(mutation));
			continue;
		}
		// The plugin's 401 means no user is logged in, so every push in this session would get one.
		if (sessionWall) {
			reportFailure({ mutation, ...sessionWall });
			continue;
		}
		// The plugin's 401 means no user is logged in, so every push in this session would get one.
		if (input.sessionExpired === true && !freshExplicitQueuedAt.has(recordKey(mutation))) {
			deferred += 1;
			blockedRecords.add(recordKey(mutation));
			continue;
		}
		// Backoff gate (ADR 0012): a mutation rescheduled after an earlier failure must wait until
		// its window elapses. Skip it AND hold later edits to the same record (FIFO ordering).
		if (
			!input.retryImmediately &&
			mutation.nextAttemptAt &&
			Date.parse(mutation.nextAttemptAt) > now() &&
			!(lastAttemptAt(mutation) <= (freshExplicitQueuedAt.get(recordKey(mutation)) ?? -Infinity))
		) {
			deferred += 1;
			blockedRecords.add(recordKey(mutation));
			continue;
		}
		// `limit` caps push ATTEMPTS; the deferred/blocked rows handled above cost nothing against it.
		if (attempted >= limit) {
			break;
		}

		// Wait for the owner's durable release, so a lease expiring between this
		// read and claim can never authorize a stale append after a void.
		const admission = await input.queue.admissionState(mutation, now());
		if (admission === 'live') {
			blockedRecords.add(recordKey(mutation));
			continue;
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
			...(admission === 'released' && mutation.admittedBy
				? { admissionReleased: mutation.admittedBy }
				: {}),
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
				current?.admissionReleased !== mutation.admissionReleased ||
				current?.supersededBy !== undefined ||
				(current?.status === 'claimed' &&
					current.claimedBy !== undefined &&
					current.claimedBy !== input.drainInstanceId &&
					(current.claimedUntil ? Date.parse(current.claimedUntil) : 0) > now())
			) {
				blockedRecords.add(recordKey(mutation));
			}
			continue;
		}
		if (
			admission === 'lost' &&
			(await input.queue.admissionState(draining, now())) !== 'released'
		) {
			if (
				(await deadLetter(draining, { reason: 'admission-lost' })) !== false ||
				(await input.queue.admissionState(draining, now())) !== 'released' ||
				!(await stillOwnLease(draining.mutationId))
			)
				continue;
		}
		if (admission === 'lost') draining.admissionReleased = draining.admittedBy;
		attemptStartedAt = now();
		attempted += 1;
		const first = await attempt(draining);
		if (first.kind === 'aborted') break;
		if (first.kind === 'settled') continue;
		let result = first.result;

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
			// ORDER CONFLICT AUTO-RECOVERY (#1204, ruled 2026-08-14) — the ONE
			// carve-out from "a 409 never retries" (see `autoRecoverConflict`).
			// Re-anchor the base from the 409's own `currentRevision` and re-push the
			// SAME intent once. A recovered push falls through to the normal success
			// path below, so the outcome the caller observes is a single
			// write-acknowledged — never an intermediate write-conflict (#1209: a
			// FOLLOWER tab awaiting the outcome must see one final answer).
			const serverRevision = result.conflict?.currentRevision ?? result.currentRevision;
			const serverDocument = result.conflict?.current;
			let recovered = false;
			if (serverRevision && input.autoRecoverConflict?.(draining) === true) {
				const reanchored = { ...draining, baseRevision: serverRevision };
				// A re-anchored push that throws settles exactly as a first attempt
				// would (a 428 is owed one refresh per push it re-anchors), never
				// parked 'conflicted' — that would hide the server's real verdict.
				const retried = await attempt(reanchored, async () => {
					if (serverDocument) await input.reconcileConflict?.(reanchored, serverDocument);
				});
				if (retried.kind === 'aborted') break;
				if (retried.kind === 'settled') continue;
				const retry = retried.result;
				if (input.signal?.aborted) {
					break;
				}
				// LEASE FENCE again: the re-push is a second network op, so the lease
				// may have been stolen while it was in flight (same reasoning as the
				// fence above the outcome recording).
				if (!(await stillOwnLease(mutation.mutationId))) {
					continue;
				}
				// Park on the SECOND consecutive conflict, carrying the FRESHER server
				// truth from the retry's 409 — the ruled stopping condition.
				result = retry;
				recovered = retry.outcome !== 'conflict';
				if (recovered) {
					// A delete carries no field payload (`{ id: <uuid> }`), so there is
					// nothing to compare: the whole document going is the intent, not an
					// overwrite of particular fields. Diffing it would name `id` alone.
					const serverDocumentCompared =
						reanchored.operation !== 'delete' &&
						serverDocument !== null &&
						typeof serverDocument === 'object';
					const paths = serverDocumentCompared
						? diffConflictOverwrite(reanchored.payload, serverDocument)
						: [];
					const fields = {
						recordId: mutation.recordId,
						mutationId: mutation.mutationId,
						baseRevision: serverRevision,
					};
					if (paths.length > 0) {
						emit({
							type: 'queue.write.conflict-overwrote-server',
							level: 'warn',
							collection: mutation.collectionName,
							fields: {
								...fields,
								overwrittenFields: paths.slice(0, 25),
								overwrittenCount: paths.length,
							},
						});
					} else {
						emit({
							type: 'queue.write.conflict-recovered',
							level: 'info',
							collection: mutation.collectionName,
							fields: { ...fields, serverDocumentCompared },
						});
					}
				}
			}
			if (!recovered) {
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
				blockedRecords.add(recordKey(mutation)); // hold later edits to this record until it's resolved
				continue;
			}
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
			settleFailures.delete(`ack:${mutation.mutationId}`);
			pushed += 1;
		} catch (error) {
			if (input.signal?.aborted || (error as { name?: string })?.name === 'AbortError') break;
			// The push landed but the ack/remove failed — leave it queued (the re-push dedupes), block
			// later links, and back it off so we don't hammer. An abort here is a scope switch, not a
			// failure, so skip the backoff.
			failed += 1;
			if (!input.signal?.aborted) {
				// No push.error follows a push that landed, so this is the only row
				// about an ack that keeps failing; the streak says when it persists.
				emit({
					type: 'queue.write.ack-failed',
					level: 'warn',
					collection: mutation.collectionName,
					fields: {
						recordId: mutation.recordId,
						mutationId: mutation.mutationId,
						reason: error instanceof Error ? error.name : 'unknown',
						consecutiveFailures: noteSettleFailure('ack', mutation.mutationId),
					},
				});
			}
			blockedRecords.add(recordKey(mutation));
			if (!input.signal?.aborted) {
				await applyBackoff({ ...draining, status: 'pending' });
			}
			continue;
		}
		await settleSupersededDeadLetters(draining, result);
		input.onAcknowledged?.(draining);
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
	return {
		pushed,
		annihilated,
		annihilatedMutations: [...recovered, ...annihilation.mutations],
		held,
		conflicts,
		failed,
		sessionExpired: sessionWall !== undefined,
		failures,
		deferred,
		rejected,
	};
}
