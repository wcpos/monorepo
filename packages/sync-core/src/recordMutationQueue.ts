import { assertBulkSuccess } from './assertBulkSuccess';

import type { RecordMutation } from './recordMutation';

/**
 * The generic durable write queue shared by every collection (#507).
 *
 * Entries receive a queue-minted monotonic `seq` at enqueue — `pending()`
 * sorts by it ALONE, so same-millisecond enqueues (a fixed clock, a fast
 * device) keep their true order instead of tie-breaking on a random
 * mutationId. Each entry carries a `status` lifecycle:
 *
 *   pending ──(drain claims)──▶ claimed ──▶ acknowledged (row removed)
 *      ▲                          │ 409 stale-revision / unrecoverable 428
 *      │  resolveConflict retry   ▼
 *      └──────────────────── conflicted | needs-revision ──(discard)──▶ removed
 *      ▲                       rejected ──(discard)──▶ removed
 *      │ requeue-rebuilt (#832): a FRESH row carrying the payload rebuilt from
 *      └ the current resident; the dead letter is removed once it is enqueued.
 *
 * Coalescing contract (enforced by the write-intent layer, honored here):
 * only an UNCLAIMED (`pending`) same-record entry THAT HAS NEVER BEEN PUSHED
 * (`attempts === 0` — gate2 #516 rule 1) may be replaced. A claimed entry is
 * pushed-with-unknown-outcome (in flight now, or interrupted by an abort or a
 * crash), and a pending entry with `attempts > 0` has been pushed before: the
 * server may already hold that exact mutation, so re-issuing its intent under
 * a fresh `mutationId` would replay into the server's born-twice / dedupe
 * guards with the new payload silently ignored. An edit racing either queues
 * BEHIND it. A replacement keeps the original queue position (`seq`),
 * original `baseRevision`, and original `queuedAt`, but ALWAYS carries a
 * fresh `mutationId` — the server replays by mutationId, so a mutationId must
 * never be reused with a different payload. Terminal `conflicted` /
 * `needs-revision` / `rejected` rows persist (they are the engine's
 * `conflicts()` surface) until an explicit resolution removes them;
 * `rejected` rows are dead letters and leave `pending()` (and the pull-apply
 * guard) entirely.
 */

/**
 * A queued mutation = the write-intent plus drain-owned bookkeeping (ADR 0012).
 *
 * `attempts`/`nextAttemptAt`, the claim `status`, and the terminal conflict
 * metadata are written ONLY by the single drain owner (plus the facade's
 * explicit conflict resolution). The intent fields change only during
 * UNCLAIMED coalescing — and then under a fresh `mutationId`. Absent
 * bookkeeping ⇒ a fresh mutation: 0 attempts, `pending`, ready to push now.
 */
export type QueuedMutation = RecordMutation & {
	/** Queue-local override for cashier-triggered pushes; never serialized to the server. */
	readonly explicit?: boolean;
	/** Monotonic, per-scope queue position — minted by `enqueue`, the primary drain order key. */
	readonly seq?: number;
	/**
	 * Coalesce generation: bumped each time a replacement supersedes a same-seq
	 * row. The equal-`seq` tie-break in `pending()`, so if a crash strands BOTH
	 * the superseded row and its replacement, the replacement (latest snapshot)
	 * deterministically drains LAST and the server converges on it.
	 */
	readonly coalesced?: number;
	/** Lifecycle (see the module docblock). Absent ⇒ 'pending' (a pre-v2 row).
	 * 'needs-revision' (gate2 #516 item 4) = the server demanded a precondition
	 * (428) and no current revision could be determined — parked until an
	 * explicit resolution refreshes the revision (retry) or discards. Unlike
	 * 'conflicted' it carries NO server truth: there was no 409 envelope. */
	readonly status?: 'pending' | 'claimed' | 'conflicted' | 'needs-revision' | 'rejected';
	/** The server's `current` document from the 409 that conflicted this row — server truth for resolution. */
	readonly conflictDocument?: Record<string, unknown>;
	/** The server's current revision from that 409 — the base a retry re-stamps to. */
	readonly conflictRevision?: string | null;
	/** Push attempts that have FAILED so far (drives the backoff curve). */
	readonly attempts?: number;
	/** ISO time before which the drain must NOT re-push this mutation (the backoff gate). */
	readonly nextAttemptAt?: string;
	/**
	 * The dead letter's WHY (#832), written once at dead-letter time. Without it a
	 * 'rejected' row is an unexplained disappearance: a completed sale that exists
	 * only on this device with no way for anyone — cashier or support — to see what
	 * the server objected to. `rejectedStatus` is the HTTP status, `rejectedReason`
	 * the machine code (`rest_invalid_param`), `rejectedMessage` the server's own
	 * sentence, `rejectedAt` when the drain gave up. Nothing branches on these; they
	 * exist to be shown.
	 */
	readonly rejectedStatus?: number;
	readonly rejectedReason?: string;
	readonly rejectedMessage?: string;
	readonly rejectedAt?: string;
	/**
	 * Requeue provenance (#832). A dead letter is recovered by REBUILDING the
	 * outbound payload from the current resident and enqueueing it under a FRESH
	 * mutationId — the server replays by mutationId, so the rebuilt payload can
	 * never reuse the rejected one's. `requeuedFrom` is the dead letter this row
	 * replaces; `requeueCount` is how many times this chain has been requeued (1 on
	 * the first recovery). Both survive a SECOND dead-lettering, so the surface can
	 * show "requeued twice, still refused" instead of pretending it is a fresh
	 * failure. Requeue happens ONLY through an explicit `resolveConflict` call —
	 * there is no automatic loop.
	 */
	readonly requeuedFrom?: string;
	readonly requeueCount?: number;
	/**
	 * DURABLE RESOLUTION CLAIM (#1016/#1046 → task 43). An engine instance
	 * serializes its OWN resolutions in memory, which is enough for one process;
	 * two Electron windows are two processes over one storage and neither chain
	 * sees the other. The claim lives on the row — the only state both processes
	 * share — and is taken/released through the queue's REVISION-CHECKED writes, so
	 * exactly one process can hold it at a time.
	 *
	 * `resolutionClaimBy` is the claiming instance's id; `resolutionClaimUntil` the
	 * ISO deadline after which the claim may be STOLEN. The deadline is what makes a
	 * crashed process recoverable: a window that dies mid-resolution cannot release,
	 * and a permanent lock on a dead letter is a completed sale nobody can recover.
	 * Both absent on a row nobody is resolving.
	 */
	readonly resolutionClaimBy?: string;
	readonly resolutionClaimUntil?: string;
};

/**
 * An opaque per-row version token. Platform-neutral by design: to sync-core it is
 * just a string it round-trips from `listStored()` back into a conditional write.
 * The RxDB adapter maps it to the document's `_rev`; the in-memory adapter uses a
 * monotonic counter. Callers never parse it — they only compare "the token I read"
 * against "the token the write must still match".
 */
export type RevisionToken = string;

/** A stored row paired with the version token a conditional write must match. */
export type StoredMutation = { readonly mutation: QueuedMutation; readonly rev: RevisionToken };

/**
 * Storage port — an append-only set keyed by `mutationId`. RxDB (durable) or
 * memory (tests).
 *
 * TWO WRITE KINDS, chosen deliberately at every call site (task 43):
 *  - UNCONDITIONAL (`append` / `remove`): the caller owns the row exclusively —
 *    a first enqueue mints a fresh id nobody else holds, and an acknowledge drops
 *    a row whose push this process just completed. No other process is racing it.
 *  - CONDITIONAL / revision-checked (`appendIfUnchanged` / `removeIfUnchanged`):
 *    the write must land ONLY IF the row is still exactly as the caller last read
 *    it (`expectedRev`). This is the cross-process guard: the in-memory
 *    single-writer chain serializes contention within ONE process, but two
 *    Electron windows are two processes over one storage, and only the storage's
 *    own revision check can make a claim/resolve/coalesce mutually exclusive
 *    across them. A stale write returns `false` (RxDB answers its native 409
 *    CONFLICT; memory compares the token) and the caller re-reads and re-decides.
 */
export type RecordMutationStorage = {
	list(): Promise<QueuedMutation[]>;
	/**
	 * Every row WITH its current version token — the read half of a revision-checked
	 * transition. A CAS method captures a row's `rev` here, decides, then hands that
	 * same token to `appendIfUnchanged` / `removeIfUnchanged` so the write is refused
	 * if anything moved the row in between (in this process or another).
	 */
	listStored(): Promise<StoredMutation[]>;
	/**
	 * Persist a queued mutation UNCONDITIONALLY, keyed by `mutationId` (an upsert).
	 * For writes whose row the caller owns exclusively — the first enqueue, and the
	 * drain-owned bookkeeping on a row this process has already claimed.
	 */
	append(mutation: QueuedMutation): Promise<void>;
	/**
	 * Revision-checked upsert: write `mutation` ONLY IF its stored row still carries
	 * `expectedRev` — or, when `expectedRev` is `null`, ONLY IF no row exists yet
	 * (an insert). Returns `false` without writing when the precondition fails: the
	 * row moved, or a row already exists for an insert. This is how a claim, a
	 * coalesce, or a drain-claim stays exactly-once across processes.
	 */
	appendIfUnchanged(mutation: QueuedMutation, expectedRev: RevisionToken | null): Promise<boolean>;
	/** Remove the exact mutations UNCONDITIONALLY, by `mutationId`. */
	remove(mutationIds: readonly string[]): Promise<void>;
	/**
	 * Revision-checked remove: drop the row ONLY IF it still carries `expectedRev`.
	 * Returns `false` when the row is gone or has moved — the caller then knows some
	 * other transition (or process) settled it first.
	 */
	removeIfUnchanged(mutationId: string, expectedRev: RevisionToken): Promise<boolean>;
};

export class RecordMutationQueue {
	/**
	 * The queue's single-writer chain — every CONTENDED state transition (seq
	 * minting, drain claims, coalesce swaps, annihilating removes) runs
	 * serialized through it and re-reads the row INSIDE its turn: the queue's
	 * CAS idiom, generalized from the seq mint. The engine holds exactly ONE
	 * queue per scope database (`queueFor` memoizes), so the chain is a true
	 * mutex for these transitions: a drain claim can never resurrect a row an
	 * annihilating delete just removed, and two concurrent coalesces can never
	 * both consume the same prior row.
	 */
	private chain: Promise<unknown> = Promise.resolve();
	public constructor(private readonly storage: RecordMutationStorage) {}

	private transact<T>(op: () => Promise<T>): Promise<T> {
		const run = this.chain.then(op, op);
		this.chain = run.then(
			() => undefined,
			() => undefined
		);
		return run;
	}

	/**
	 * Append with a queue-owned monotonic position: read max(seq), insert at
	 * max+1 — serialized on the transition chain, with an insert-conflict (409)
	 * from the storage retrying the whole read-max+insert CAS — so seq stays
	 * strictly monotonic per scope.
	 */
	async enqueue(mutation: RecordMutation): Promise<QueuedMutation> {
		return this.transact(async () => {
			for (;;) {
				const seq = Math.max(0, ...(await this.storage.list()).map((item) => item.seq ?? 0)) + 1;
				const queued = { ...mutation, seq, status: 'pending' as const };
				try {
					await this.storage.append(queued);
					return queued;
				} catch (error) {
					if ((error as { status?: number }).status !== 409) throw error;
				}
			}
		});
	}

	/**
	 * Conditional append (CAS) — the enqueue-shaped sibling of `coalesceInto` /
	 * `removePending`: mint the seq and insert ONLY IF `unchanged(rows)` still
	 * holds against the rows re-read INSIDE the serialized turn. Returns null
	 * when the precondition no longer holds (a concurrent enqueue or coalesce
	 * moved the queue between the caller's read and this turn) — the caller
	 * re-reads and re-decides its placement. Without this, a tail-placement
	 * decision made on a stale read could slot an OLDER snapshot behind a
	 * concurrent edit and overwrite it server-side (#516 review P1).
	 * NOTE: `unchanged` receives the RAW storage rows (unsorted, every status).
	 */
	async enqueueWhen(
		mutation: RecordMutation,
		unchanged: (rows: QueuedMutation[]) => boolean
	): Promise<QueuedMutation | null> {
		return this.transact(async () => {
			for (;;) {
				const rows = await this.storage.list();
				if (!unchanged(rows)) return null;
				const seq = Math.max(0, ...rows.map((item) => item.seq ?? 0)) + 1;
				const queued = { ...mutation, seq, status: 'pending' as const };
				try {
					await this.storage.append(queued);
					return queued;
				} catch (error) {
					if ((error as { status?: number }).status !== 409) throw error;
				}
			}
		});
	}

	/**
	 * The drain's conditional claim (CAS): persist `next` (the claimed,
	 * re-stamped row) ONLY IF the row still exists and is claimable — pending,
	 * or a stale claim left by a crashed drain. Returns false when the row left
	 * the queue (coalesced away / annihilated / resolved) between the drain's
	 * scan and this claim — the drain must then SKIP the row; an unconditional
	 * upsert here would RESURRECT a row a concurrent write intent just removed.
	 */
	async claim(next: QueuedMutation): Promise<boolean> {
		return this.transact(async () => {
			const stored = (await this.storage.listStored()).find(
				(item) => item.mutation.mutationId === next.mutationId
			);
			const row = stored?.mutation;
			if (
				!row ||
				(row.status !== undefined && row.status !== 'pending' && row.status !== 'claimed')
			)
				return false;
			// Revision-checked: two processes both draining can each SCAN the same
			// pending row, but only one can claim it — the loser's write finds the row
			// already at the winner's revision and is refused, so the row is never
			// pushed twice. (#1046 spike: the old unconditional upsert let both win.)
			return this.storage.appendIfUnchanged(next, stored.rev);
		});
	}

	/**
	 * The write-intent layer's conditional coalesce (CAS): atomically swap the
	 * still-PENDING `priorMutationId` row for `replacement` (fresh mutationId,
	 * same seq, bumped coalesced generation). Returns false without touching
	 * anything when the prior row is gone or no longer pending (claimed by the
	 * drain, or already superseded by a concurrent write) — the caller re-reads
	 * the queue and retries its coalesce decision.
	 */
	async coalesceInto(priorMutationId: string, replacement: QueuedMutation): Promise<boolean> {
		return this.transact(async () => {
			const stored = (await this.storage.listStored()).find(
				(item) => item.mutation.mutationId === priorMutationId
			);
			const row = stored?.mutation;
			// Coalescing is valid ONLY into a never-pushed pending row (#516 rule 1).
			// The write-intent layer checks `attempts === 0` on its own read, but that
			// read can be stale across processes: another window's drain may have pushed
			// this row and rescheduled it back to `pending` (attempts > 0) in between.
			// Re-assert it HERE, on the revision-checked read, so a stale replacement can
			// never consume an ever-pushed mutation under a fresh id (adversarial P2).
			if (
				!row ||
				(row.status !== undefined && row.status !== 'pending') ||
				(row.attempts ?? 0) !== 0
			)
				return false;
			// Insert the replacement under its FRESH id (nobody else holds it), then
			// remove the prior row CONDITIONALLY on the revision we just read. If the
			// prior moved between the read and the remove — a concurrent claim,
			// coalesce, or another window — the remove is refused and we unwind the
			// replacement so the swap is all-or-nothing.
			const inserted = await this.storage.appendIfUnchanged(replacement, null);
			if (!inserted) return false;
			if (await this.storage.removeIfUnchanged(priorMutationId, stored.rev)) return true;
			// Compensation is CONDITIONAL on the replacement still being pending: if a
			// drain in another window claimed it in the microtask window, removing it
			// unconditionally would cancel a push that may already be reaching the
			// server. Leave a claimed replacement in place (the server dedupes on its
			// mutationId) rather than delete in-flight work (adversarial P2).
			await this.removePendingInternal(replacement.mutationId);
			return false;
		});
	}

	/** `removePending` without the transact wrapper — for use INSIDE a transaction. */
	private async removePendingInternal(mutationId: string): Promise<boolean> {
		const stored = (await this.storage.listStored()).find(
			(item) => item.mutation.mutationId === mutationId
		);
		const row = stored?.mutation;
		if (!row || (row.status !== undefined && row.status !== 'pending')) return false;
		return this.storage.removeIfUnchanged(mutationId, stored.rev);
	}

	/**
	 * Conditional remove (CAS) — annihilation's transition: drop the row ONLY
	 * IF it is still pending. Returns false when it is gone or claimed — a
	 * drain-in-flight create must NOT be annihilated (the server may already be
	 * applying it); the delete queues behind it instead.
	 */
	async removePending(mutationId: string): Promise<boolean> {
		return this.transact(async () => {
			const stored = (await this.storage.listStored()).find(
				(item) => item.mutation.mutationId === mutationId
			);
			const row = stored?.mutation;
			if (!row || (row.status !== undefined && row.status !== 'pending')) return false;
			// Revision-checked: a drain-in-flight claim in another process must not be
			// annihilated. If the row moved to 'claimed' after our read, the remove is
			// refused and the delete queues behind the in-flight create instead.
			return this.storage.removeIfUnchanged(mutationId, stored.rev);
		});
	}

	/** Restore an ordered removed chain ahead of same-record rows that arrived
	 * while it was absent. The serialized turn shifts the occupied suffix, so
	 * restored dependencies drain before their newcomers without disturbing
	 * earlier cross-record work. */
	async restoreAheadOfRecordNewcomers(rows: readonly QueuedMutation[]): Promise<QueuedMutation[]> {
		return this.transact(async () => {
			if (rows.length === 0) return [];
			const existing = await this.storage.list();
			const head = rows[0];
			const newcomers = existing.filter(
				(item) => item.collectionName === head.collectionName && item.recordId === head.recordId
			);
			const insertionSeq =
				newcomers.length > 0
					? Math.min(...newcomers.map((item) => item.seq ?? 0))
					: Math.max(0, ...existing.map((item) => item.seq ?? 0)) + 1;
			const suffix = existing
				.filter((item) => (item.seq ?? 0) >= insertionSeq)
				.sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
			const shifted: QueuedMutation[] = [];
			const restored: QueuedMutation[] = [];
			try {
				for (const item of suffix) {
					shifted.push(item);
					await this.storage.append({ ...item, seq: (item.seq ?? 0) + rows.length });
				}
				let seq = insertionSeq;
				for (const row of rows) {
					const fresh = { ...row, seq: seq++ };
					restored.push(fresh);
					await this.storage.append(fresh);
				}
			} catch (error) {
				await this.storage.remove(restored.map((item) => item.mutationId));
				for (const item of [...shifted].reverse()) await this.storage.append(item);
				throw error;
			}
			return restored;
		});
	}

	/**
	 * Re-write a queued mutation's retry bookkeeping (attempts + nextAttemptAt) after a failed
	 * push — a keyed upsert by `mutationId`, so the write-intent is unchanged and no other entry
	 * is touched. Only the single drain owner calls this.
	 */
	async reschedule(mutation: QueuedMutation): Promise<void> {
		await this.storage.append(mutation);
	}

	/**
	 * Re-write one entry in place (a keyed upsert by `mutationId`). Two callers:
	 * the drain's status transitions (claim / conflict / reject / back-to-pending)
	 * keep the intent fields byte-identical; the write-intent layer's coalescing
	 * replaces an UNCLAIMED entry's intent under a FRESH mutationId (the caller
	 * then removes the superseded row) — never reuse a mutationId with a
	 * different payload, the server replays by it.
	 */
	async replace(mutation: QueuedMutation): Promise<void> {
		await this.storage.append(mutation);
	}

	/** Remove exact entries by `mutationId` — coalesce supersession, annihilation, and conflict discard. */
	async remove(mutationIds: readonly string[]): Promise<void> {
		await this.storage.remove(mutationIds);
	}

	/**
	 * Conditional remove (CAS) for a TERMINAL row — the dead-letter recovery's
	 * transition (#832): drop the row ONLY IF it still holds `status`. Returns
	 * false when it is gone or already moved, which is how two concurrent
	 * resolutions of one dead letter settle: exactly one wins the remove, and the
	 * loser compensates by unwinding the replacement it enqueued. Without it both
	 * would enqueue a rebuild and both would remove, leaving two live writes for
	 * one recovery.
	 */
	async removeIfStatus(mutationId: string, status: QueuedMutation['status']): Promise<boolean> {
		return this.transact(async () => {
			const stored = (await this.storage.listStored()).find(
				(item) => item.mutation.mutationId === mutationId
			);
			if (!stored || stored.mutation.status !== status) return false;
			// Revision-checked: two concurrent resolutions of one dead letter (two
			// windows) both reach here, but only one remove lands — the loser sees the
			// row already gone and compensates. Cross-process, the resolution claim
			// above already gates this to one holder; the conditional remove is the
			// belt to that suspenders, and covers a claim stolen after its deadline.
			return this.storage.removeIfUnchanged(mutationId, stored.rev);
		});
	}

	/**
	 * DURABLE RESOLUTION CLAIM (CAS) — the cross-process half of resolution safety
	 * (#1016/#1046 → task 43). Returns:
	 *  - `claimed` — the caller holds it until `untilIso`;
	 *  - `held` — someone else holds an UNEXPIRED claim; the caller must not proceed;
	 *  - `gone` — the row is absent or no longer in `expectedStatus` (already settled).
	 *
	 * A claim is STEALABLE once its deadline passes — the only safe direction, since
	 * a crashed holder can never release and a permanent lock strands a sale. The
	 * write is revision-checked, so two windows racing to claim resolve to exactly
	 * one winner even though each has its own in-process chain.
	 */
	async claimForResolution(input: {
		mutationId: string;
		expectedStatus: QueuedMutation['status'];
		holder: string;
		untilIso: string;
		nowMs: number;
	}): Promise<'claimed' | 'held' | 'gone'> {
		return this.transact(async () => {
			const stored = (await this.storage.listStored()).find(
				(item) => item.mutation.mutationId === input.mutationId
			);
			if (!stored || stored.mutation.status !== input.expectedStatus) return 'gone';
			const heldBy = stored.mutation.resolutionClaimBy;
			const until = stored.mutation.resolutionClaimUntil
				? Date.parse(stored.mutation.resolutionClaimUntil)
				: 0;
			// Our own claim is re-takeable (a retry inside one process); an expired one
			// is stealable; a live foreign holder is not.
			if (heldBy !== undefined && heldBy !== input.holder && until > input.nowMs) return 'held';
			const claimed = await this.storage.appendIfUnchanged(
				{
					...stored.mutation,
					resolutionClaimBy: input.holder,
					resolutionClaimUntil: input.untilIso,
				},
				stored.rev
			);
			// A refused write means another window claimed it in the same instant —
			// treat as held; the caller backs off exactly as for a live holder.
			return claimed ? 'claimed' : 'held';
		});
	}

	/**
	 * Release a claim this holder still owns, by parking its deadline in the past so
	 * the row is immediately re-claimable. A no-op when the row is GONE (a successful
	 * resolution already removed it — re-writing would resurrect a retired dead
	 * letter) or when someone else now holds it (ours expired and was stolen —
	 * clearing a live foreign claim would hand the row to a third process).
	 * Revision-checked, so the release cannot clobber a concurrent steal.
	 */
	async releaseResolutionClaim(mutationId: string, holder: string): Promise<void> {
		await this.transact(async () => {
			const stored = (await this.storage.listStored()).find(
				(item) => item.mutation.mutationId === mutationId
			);
			if (!stored || stored.mutation.resolutionClaimBy !== holder) return;
			await this.storage.appendIfUnchanged(
				{ ...stored.mutation, resolutionClaimUntil: new Date(0).toISOString() },
				stored.rev
			);
		});
	}

	/** EVERY stored entry, terminal rows included — the engine's `conflicts()` reads this. */
	async all(): Promise<QueuedMutation[]> {
		return this.storage.list();
	}

	/**
	 * Un-drained local work in monotonic `seq` order, up to `limit`: pending +
	 * claimed (in-flight) + conflicted / needs-revision (awaiting resolution)
	 * rows. `rejected` dead letters are excluded — the record they touched is
	 * syncable again. The drain further narrows to actionable rows; this wider
	 * set is what queue-depth and the pull-apply guard key off.
	 */
	async pending(limit = Number.POSITIVE_INFINITY): Promise<QueuedMutation[]> {
		const mutations = await this.storage.list();
		return mutations
			.filter((mutation) => mutation.status !== 'rejected')
			.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || (a.coalesced ?? 0) - (b.coalesced ?? 0))
			.slice(0, Math.max(0, limit));
	}

	/**
	 * Drop the EXACT mutations that were pushed, by `mutationId`. An edit that landed
	 * for the same record during the push is a separate entry and is left untouched,
	 * so no newer write is lost.
	 */
	async acknowledge(mutationIds: readonly string[]): Promise<void> {
		if (mutationIds.length === 0) return;
		await this.storage.remove(mutationIds);
	}
}

/**
 * Every record id with un-pushed local work — feed to the pull-apply guard so
 * a scheduled pull can never overwrite it. `rejected` dead letters do NOT
 * guard: their record has no local work left to lose, and a subsequent pull
 * restoring server truth is exactly the recovery path (#507 regression 4).
 */
export function pendingRecordIds(mutations: readonly QueuedMutation[]): Set<string> {
	const ids = new Set<string>();
	for (const mutation of mutations) {
		if (mutation.status === 'rejected') continue;
		ids.add(mutation.recordId);
	}
	return ids;
}

/**
 * In-memory storage — for tests and ephemeral hosts.
 *
 * It keeps a monotonic revision token per row, exactly so TWO
 * `RecordMutationQueue` instances sharing ONE storage model two processes over
 * one durable store: each instance captures a row's token through `listStored`
 * and its conditional writes are refused when the other moved the row first. That
 * is what lets the cross-process resolution-claim tests run without RxDB.
 */
export class InMemoryRecordMutationStorage implements RecordMutationStorage {
	private readonly mutations = new Map<string, { mutation: QueuedMutation; rev: RevisionToken }>();
	private revCounter = 0;

	private nextRev(): RevisionToken {
		this.revCounter += 1;
		return `rev-${this.revCounter}`;
	}

	async list(): Promise<QueuedMutation[]> {
		return [...this.mutations.values()].map((entry) => entry.mutation);
	}

	async listStored(): Promise<StoredMutation[]> {
		return [...this.mutations.values()].map((entry) => ({
			mutation: entry.mutation,
			rev: entry.rev,
		}));
	}

	async append(mutation: QueuedMutation): Promise<void> {
		this.mutations.set(mutation.mutationId, { mutation, rev: this.nextRev() });
	}

	async appendIfUnchanged(
		mutation: QueuedMutation,
		expectedRev: RevisionToken | null
	): Promise<boolean> {
		const existing = this.mutations.get(mutation.mutationId);
		if (expectedRev === null) {
			if (existing) return false; // insert-if-absent: a row already exists
		} else if (!existing || existing.rev !== expectedRev) {
			return false; // moved (or gone) since the caller read it
		}
		this.mutations.set(mutation.mutationId, { mutation, rev: this.nextRev() });
		return true;
	}

	async remove(mutationIds: readonly string[]): Promise<void> {
		for (const mutationId of mutationIds) {
			this.mutations.delete(mutationId);
		}
	}

	async removeIfUnchanged(mutationId: string, expectedRev: RevisionToken): Promise<boolean> {
		const existing = this.mutations.get(mutationId);
		if (!existing || existing.rev !== expectedRev) return false;
		this.mutations.delete(mutationId);
		return true;
	}
}

/**
 * Structural view of the RxDB collection backing the durable queue — declared here (not imported from rxdb) so
 * sync-core stays platform-neutral. The host passes its real RxCollection; only these members are used.
 *
 * The document members carry the revision-checked write (task 43): `revision` is
 * RxDB's `_rev`, and `patch` / `remove` are the NON-incremental variants that
 * fail closed with a native 409 CONFLICT when the stored `_rev` has moved since
 * the document was fetched — the exact cross-process guard the port needs. (The
 * `incremental*` variants retry through conflicts and would DEFEAT a claim, so
 * they are deliberately not used.) A real RxDocument satisfies this shape.
 */
export type RxRecordMutationDocument = {
	toJSON(): QueuedMutation;
	readonly revision?: string;
	patch(changes: Partial<QueuedMutation>): Promise<unknown>;
	remove(): Promise<unknown>;
};
export type RxRecordMutationCollection = {
	bulkUpsert(items: QueuedMutation[]): Promise<unknown>;
	/** Insert-if-absent — a per-row 409 in `error` means the id already exists. */
	bulkInsert(items: QueuedMutation[]): Promise<unknown>;
	find(query?: unknown): { exec(): Promise<(RxRecordMutationDocument | QueuedMutation)[]> };
	bulkRemove(mutationIds: string[]): Promise<unknown>;
};

/** True for the storage's native optimistic-concurrency refusal (RxDB: 409 / `CONFLICT`). */
function isRevisionConflict(error: unknown): boolean {
	const e = error as { status?: number; code?: string } | null;
	return e?.status === 409 || e?.code === 'CONFLICT';
}

/** Every per-row failure in a bulk result is a 409, i.e. purely a revision conflict. */
function onlyConflicts(result: unknown): boolean {
	const failures = (result as { error?: { status?: number }[] } | null)?.error ?? [];
	return failures.length > 0 && failures.every((failure) => failure.status === 409);
}

/**
 * Durable RxDB-backed storage for the record mutation queue.
 *
 * Two write kinds (task 43): `append`/`remove` are UNCONDITIONAL upserts/deletes
 * on a `mutationId` the caller owns; `appendIfUnchanged`/`removeIfUnchanged` are
 * REVISION-CHECKED — they patch/remove the RxDocument only while its `_rev` still
 * matches what the caller read, and map RxDB's native 409 to a `false` return.
 * That is what makes a resolution claim, a drain claim, and a coalesce
 * mutually-exclusive across two Electron windows sharing one storage worker.
 */
export class RxRecordMutationStorage implements RecordMutationStorage {
	public constructor(
		private readonly collectionOrResolver:
			RxRecordMutationCollection | (() => RxRecordMutationCollection)
	) {}

	private collection(): RxRecordMutationCollection {
		return typeof this.collectionOrResolver === 'function'
			? this.collectionOrResolver()
			: this.collectionOrResolver;
	}

	private async documents(): Promise<RxRecordMutationDocument[]> {
		const rows = await this.collection().find().exec();
		// The real collection returns RxDocuments; a bare-object row (older test
		// fakes exercising only the unconditional read path) is wrapped so `list()`
		// still works. Its `patch`/`remove` reject — a conditional write against a
		// non-RxDocument is a wiring error, never a runtime path.
		return rows.map((row) =>
			'toJSON' in row
				? (row as RxRecordMutationDocument)
				: {
						toJSON: () => row as QueuedMutation,
						patch: () => Promise.reject(new Error('conditional write on a non-RxDocument row')),
						remove: () => Promise.reject(new Error('conditional write on a non-RxDocument row')),
					}
		);
	}

	async list(): Promise<QueuedMutation[]> {
		// No sort clause: seq is not indexed (RxDB rejects sorting on a non-indexed field at runtime), and it
		// need not be — the queue is small, and RecordMutationQueue.pending() applies the monotonic seq order
		// in memory. list() just returns every stored row.
		return (await this.documents()).map((document) => document.toJSON());
	}

	async listStored(): Promise<StoredMutation[]> {
		// The `_rev` is the version token a conditional write must still match. A row
		// with no revision (a test fake) yields '' — harmless, since only conditional
		// writes read it and those run against the real RxDB.
		return (await this.documents()).map((document) => ({
			mutation: document.toJSON(),
			rev: document.revision ?? '',
		}));
	}

	async append(mutation: QueuedMutation): Promise<void> {
		// RxDB's bulk* APIs report per-row failures in `error` instead of throwing. Surface them:
		// a silently-dropped queue write would fake enqueue atomicity (the compensating delete in
		// the write-intent layer) and fake the drain's durable status transitions.
		assertBulkSuccess(await this.collection().bulkUpsert([mutation]), 'mutation queue append');
	}

	async appendIfUnchanged(
		mutation: QueuedMutation,
		expectedRev: RevisionToken | null
	): Promise<boolean> {
		if (expectedRev === null) {
			// Insert-if-absent: a 409 means the id already exists (someone enqueued a
			// replacement first). Any other failure is a real fault and must throw.
			const result = await this.collection().bulkInsert([mutation]);
			if (onlyConflicts(result)) return false;
			assertBulkSuccess(result, 'mutation queue conditional insert');
			return true;
		}
		const document = (await this.documents()).find(
			(candidate) => candidate.toJSON().mutationId === mutation.mutationId
		);
		// Gone, or already moved since the caller read it: the precondition fails.
		if (!document || (document.revision ?? '') !== expectedRev) return false;
		try {
			// Non-incremental patch: atomic against the `_rev` we just verified, so a
			// concurrent write landing between the read above and here fails the patch
			// with 409 rather than silently overwriting.
			await document.patch(mutation);
			return true;
		} catch (error) {
			if (isRevisionConflict(error)) return false;
			throw error;
		}
	}

	async remove(mutationIds: readonly string[]): Promise<void> {
		if (mutationIds.length === 0) return;
		assertBulkSuccess(
			await this.collection().bulkRemove([...mutationIds]),
			'mutation queue remove'
		);
	}

	async removeIfUnchanged(mutationId: string, expectedRev: RevisionToken): Promise<boolean> {
		const document = (await this.documents()).find(
			(candidate) => candidate.toJSON().mutationId === mutationId
		);
		if (!document || (document.revision ?? '') !== expectedRev) return false;
		try {
			await document.remove();
			return true;
		} catch (error) {
			if (isRevisionConflict(error)) return false;
			throw error;
		}
	}
}

/** RxDB collection schema for the durable queue — one row per mutation (`mutationId` PK). */
export const recordMutationQueueSchema = {
	title: 'record mutation queue schema',
	version: 5,
	primaryKey: 'mutationId',
	type: 'object',
	properties: {
		mutationId: { type: 'string', maxLength: 64 },
		recordId: { type: 'string', maxLength: 64 },
		collectionName: { type: 'string', maxLength: 64 },
		operation: { type: 'string', enum: ['create', 'update', 'delete'] },
		origin: { type: 'string', enum: ['existing', 'server-meta', 'minted'] },
		payload: { type: 'object', additionalProperties: true },
		baseRevision: { type: ['string', 'null'] },
		queuedAt: { type: 'string', maxLength: 32 },
		explicit: { type: 'boolean' },
		seq: { type: 'number', minimum: 1, multipleOf: 1 },
		coalesced: { type: 'number', minimum: 0, multipleOf: 1 },
		status: {
			type: 'string',
			enum: ['pending', 'claimed', 'conflicted', 'needs-revision', 'rejected'],
		},
		conflictDocument: { type: 'object', additionalProperties: true },
		conflictRevision: { type: ['string', 'null'] },
		// The QueuedMutation retry fields (ADR 0012) — persisted so a reload keeps
		// the backoff gate (v1, landed with the facade's live drain exactly as the
		// v0 note always planned). Optional: a v0 row simply has no attempts yet.
		attempts: { type: 'number', minimum: 0, maximum: 1_000_000, multipleOf: 1 },
		nextAttemptAt: { type: 'string', maxLength: 32 },
		// The dead letter's reason + requeue provenance (#832) — optional, so every
		// row that never dead-lettered simply has none.
		rejectedStatus: { type: 'number', minimum: 0, maximum: 1_000, multipleOf: 1 },
		rejectedReason: { type: 'string' },
		rejectedMessage: { type: 'string' },
		rejectedAt: { type: 'string', maxLength: 32 },
		requeuedFrom: { type: 'string', maxLength: 64 },
		requeueCount: { type: 'number', minimum: 0, maximum: 1_000_000, multipleOf: 1 },
		// The durable resolution claim (task 43) — optional, so a row nobody is
		// resolving simply has neither.
		resolutionClaimBy: { type: 'string', maxLength: 64 },
		resolutionClaimUntil: { type: 'string', maxLength: 32 },
	},
	required: ['mutationId', 'recordId', 'collectionName', 'operation', 'payload', 'queuedAt'],
} as const;

/**
 * v0 → v1: `attempts`/`nextAttemptAt` are new OPTIONAL fields — rows pass through.
 * v1 → v2: synthesize the queue-minted fields. A durable v1 row predates `seq`,
 * so mint one that (a) preserves the old (queuedAt) drain order, (b) is
 * deterministic, and (c) never consults other rows (RxDB migrates per-doc):
 * millisecond timestamp × 1000 + a 3-digit hash of the mutationId as the
 * same-millisecond tie-break. Fresh enqueues continue from max(seq)+1, so the
 * large synthesized values stay monotonic with new work.
 * v2 → v3: the `status` enum gains 'needs-revision' (gate2 #516 item 4) — a
 * pure widening, rows pass through.
 * v3 → v4: the dead-letter reason + requeue provenance fields (#832) — all
 * OPTIONAL additive properties, so rows pass through untouched.
 *
 * WHY v4 AND NOT AN IN-PLACE AMEND OF v3. The house rule for an UNRELEASED
 * schema on `next` is to amend in place, because dev installs can just reset.
 * That reasoning does not hold for THIS collection. RxDB keys its internal
 * collection document by `name-version` (rx-database-internal-store.js:268), so
 * an amended v3 keeps the same key with a different schema hash and
 * `addCollections` throws DB6 (rx-database.js:323) — the engine fails to open
 * the scope database at all, not just this collection. Every existing next
 * profile would need wiping, and wiping the mutation queue DESTROYS the
 * dead-lettered sales this very feature exists to recover (dev-next still
 * carries stranded orders from the #786 incident). A one-line passthrough at v4
 * costs nothing and keeps them. Flagged for ruling in the #832 PR.
 * v4 → v5: the durable resolution-claim fields (task 43) — OPTIONAL additive
 * properties, rows pass through. A new version for the same DB6 reason as v4: an
 * in-place amend of a released v4 keeps the `name-version` key with a different
 * schema hash and the scope database fails to open at all.
 */
export const recordMutationQueueMigrationStrategies = {
	1: (doc: QueuedMutation): QueuedMutation => doc,
	2: (doc: QueuedMutation): QueuedMutation => ({
		...doc,
		seq:
			doc.seq ??
			Math.max(0, Date.parse(doc.queuedAt)) * 1_000 +
				[...doc.mutationId].reduce((n, c) => (n * 33 + c.charCodeAt(0)) % 1_000, 0) +
				1,
		status: doc.status ?? 'pending',
	}),
	3: (doc: QueuedMutation): QueuedMutation => doc,
	4: (doc: QueuedMutation): QueuedMutation => doc,
	5: (doc: QueuedMutation): QueuedMutation => doc,
};
