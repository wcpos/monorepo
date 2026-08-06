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
	 * DURABLE RESOLUTION CLAIM (#832 follow-up — the cross-process residual left
	 * open by #1016). An engine instance serializes its OWN resolutions in memory,
	 * which is enough for one process; two Electron windows are two processes over
	 * one storage, and in-memory serialization says nothing about the other one. So
	 * the claim lives on the row — the only state both processes actually share.
	 *
	 * `resolutionClaimBy` is the claiming instance's id, `resolutionClaimUntil` the
	 * ISO deadline after which the claim may be STOLEN. The deadline is what makes
	 * a crashed window recoverable: a process that dies mid-resolution cannot
	 * release, and without expiry its dead letter would be permanently unresolvable
	 * — which for a rejected CREATE means a completed sale nobody can ever recover.
	 * Both are absent on a row nobody is resolving.
	 */
	readonly resolutionClaimBy?: string;
	readonly resolutionClaimUntil?: string;
};

/** Storage port — an append-only set keyed by `mutationId`. RxDB (durable) or memory (tests). */
export type RecordMutationStorage = {
	list(): Promise<QueuedMutation[]>;
	/**
	 * Persist a queued mutation, keyed by `mutationId` (an upsert). `enqueue` writes a fresh
	 * write-intent; `reschedule` re-writes the same entry with updated retry bookkeeping.
	 */
	append(mutation: QueuedMutation): Promise<void>;
	/** Remove the exact mutations that were acknowledged, by `mutationId`. */
	remove(mutationIds: readonly string[]): Promise<void>;
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
			const row = (await this.storage.list()).find((item) => item.mutationId === next.mutationId);
			if (
				!row ||
				(row.status !== undefined && row.status !== 'pending' && row.status !== 'claimed')
			)
				return false;
			await this.storage.append(next);
			return true;
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
			const row = (await this.storage.list()).find((item) => item.mutationId === priorMutationId);
			if (!row || (row.status !== undefined && row.status !== 'pending')) return false;
			await this.storage.append(replacement);
			await this.storage.remove([priorMutationId]);
			return true;
		});
	}

	/**
	 * Conditional remove (CAS) — annihilation's transition: drop the row ONLY
	 * IF it is still pending. Returns false when it is gone or claimed — a
	 * drain-in-flight create must NOT be annihilated (the server may already be
	 * applying it); the delete queues behind it instead.
	 */
	async removePending(mutationId: string): Promise<boolean> {
		return this.transact(async () => {
			const row = (await this.storage.list()).find((item) => item.mutationId === mutationId);
			if (!row || (row.status !== undefined && row.status !== 'pending')) return false;
			await this.storage.remove([mutationId]);
			return true;
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
			const row = (await this.storage.list()).find((item) => item.mutationId === mutationId);
			if (!row || row.status !== status) return false;
			await this.storage.remove([mutationId]);
			return true;
		});
	}

	/**
	 * DURABLE RESOLUTION CLAIM (CAS) — the cross-process half of resolution
	 * safety (#832 follow-up; the residual #1016 left open).
	 *
	 * An engine instance serializes its own resolutions in memory. Two Electron
	 * windows are two processes over one storage, each with its own chain, so that
	 * says nothing about the other: a discard in window A can still interleave a
	 * requeue in window B, and the outcome #1016 documents is a destroyed order
	 * reappearing because the other window's replacement was already claimed by a
	 * drain. The row is the ONLY state both processes share, so the lock lives
	 * there — no new collection, no storage-specific primitive
	 * (`navigator.locks` does not exist in the Electron main/worker storage path,
	 * and would not cover the RN host at all).
	 *
	 * Returns:
	 *  - `claimed` — the caller now holds it until `untilIso`;
	 *  - `held` — someone else holds an UNEXPIRED claim; the caller must not proceed;
	 *  - `gone` — the row is absent or no longer in `expectedStatus`, so there is
	 *    nothing to resolve (a concurrent resolution already settled it).
	 *
	 * A claim is STEALABLE once its deadline passes. That is deliberate and it is
	 * the only safe direction: a window that crashes mid-resolution can never
	 * release, and a permanent lock on a dead letter is a completed sale nobody can
	 * ever recover — strictly worse than the race the lock exists to prevent.
	 * Stealing is safe because every step a resolution actually performs is
	 * independently CAS-guarded (`removeIfStatus` retires the terminal row exactly
	 * once; `removePending` unwinds only an unclaimed replacement), so a stolen
	 * claim cannot double-apply — it can only lose those CASes.
	 */
	async claimForResolution(input: {
		mutationId: string;
		expectedStatus: QueuedMutation['status'];
		holder: string;
		untilIso: string;
		nowMs: number;
	}): Promise<'claimed' | 'held' | 'gone'> {
		return this.transact(async () => {
			const row = (await this.storage.list()).find((item) => item.mutationId === input.mutationId);
			if (!row || row.status !== input.expectedStatus) return 'gone';
			const heldBy = row.resolutionClaimBy;
			const until = row.resolutionClaimUntil ? Date.parse(row.resolutionClaimUntil) : 0;
			// Our own claim is always re-takeable (a retry inside one process), and an
			// expired one is stealable. Anything else is a live foreign holder.
			if (heldBy !== undefined && heldBy !== input.holder && until > input.nowMs) return 'held';
			await this.storage.append({
				...row,
				resolutionClaimBy: input.holder,
				resolutionClaimUntil: input.untilIso,
			});
			return 'claimed';
		});
	}

	/**
	 * Release a claim this holder still owns. A no-op when the row is GONE — the
	 * common case, because a successful resolution removes it, and re-appending
	 * here would RESURRECT a dead letter the caller just retired. Also a no-op when
	 * someone else now holds it (ours expired and was stolen): clearing a live
	 * foreign claim would hand the row to a third process mid-resolution.
	 */
	async releaseResolutionClaim(mutationId: string, holder: string): Promise<void> {
		await this.transact(async () => {
			const row = (await this.storage.list()).find((item) => item.mutationId === mutationId);
			if (!row || row.resolutionClaimBy !== holder) return;
			const { resolutionClaimBy: _by, resolutionClaimUntil: _until, ...released } = row;
			await this.storage.append(released);
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

/** In-memory storage — for tests and ephemeral hosts. */
export class InMemoryRecordMutationStorage implements RecordMutationStorage {
	private readonly mutations = new Map<string, QueuedMutation>();

	async list(): Promise<QueuedMutation[]> {
		return [...this.mutations.values()];
	}

	async append(mutation: QueuedMutation): Promise<void> {
		this.mutations.set(mutation.mutationId, mutation);
	}

	async remove(mutationIds: readonly string[]): Promise<void> {
		for (const mutationId of mutationIds) {
			this.mutations.delete(mutationId);
		}
	}
}

/**
 * Structural view of the RxDB collection backing the durable queue — declared here (not imported from rxdb) so
 * sync-core stays platform-neutral. The host passes its real RxCollection; only these members are used.
 */
export type RxRecordMutationDocument = { toJSON(): QueuedMutation };
export type RxRecordMutationCollection = {
	bulkUpsert(items: QueuedMutation[]): Promise<unknown>;
	find(query?: unknown): { exec(): Promise<(RxRecordMutationDocument | QueuedMutation)[]> };
	bulkRemove(mutationIds: string[]): Promise<unknown>;
};

/**
 * Durable RxDB-backed storage for the record mutation queue. Append-only: `append` is a keyed upsert on the
 * immutable `mutationId`, and `remove` deletes exactly those ids — no read-modify-write and no race guard is
 * needed, because a mutationId is unique per enqueue and never reused (an edit landing mid-push is a DIFFERENT
 * mutationId, so it is never collaterally removed).
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

	async list(): Promise<QueuedMutation[]> {
		// No sort clause: seq is not indexed (RxDB rejects sorting on a non-indexed field at runtime), and it
		// need not be — the queue is small, and RecordMutationQueue.pending() applies the monotonic seq order
		// in memory. list() just returns every stored row.
		const documents = await this.collection().find().exec();
		return documents.map((document) => ('toJSON' in document ? document.toJSON() : document));
	}

	async append(mutation: QueuedMutation): Promise<void> {
		// RxDB's bulk* APIs report per-row failures in `error` instead of throwing. Surface them:
		// a silently-dropped queue write would fake enqueue atomicity (the compensating delete in
		// the write-intent layer) and fake the drain's durable status transitions.
		assertBulkSuccess(await this.collection().bulkUpsert([mutation]), 'mutation queue append');
	}

	async remove(mutationIds: readonly string[]): Promise<void> {
		if (mutationIds.length === 0) return;
		assertBulkSuccess(
			await this.collection().bulkRemove([...mutationIds]),
			'mutation queue remove'
		);
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
		// The durable resolution claim (#832 follow-up) — optional, so a row nobody
		// is resolving simply has neither.
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
 * v4 → v5: the durable resolution claim (`resolutionClaimBy` /
 * `resolutionClaimUntil`) — OPTIONAL additive properties, rows pass through. A
 * new version for the same DB6 reason as v4: an in-place amend of a released v4
 * keeps the `name-version` key with a different schema hash and the scope
 * database fails to open at all.
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
