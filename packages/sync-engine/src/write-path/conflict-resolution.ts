import {
	type QueuedMutation,
	type RecordMutationQueue,
	type RemoteId,
	remoteIdOrNull,
	type StoreScopeManager,
	type SyncObserver,
} from '@wcpos/sync-core';

import { writeFacetFor } from '../collections/collection-descriptors';
import { fetchOrderServerRevision } from './order-server-revision';
import { requeueRejectedMutation } from './write-intents';

import type { BarcodeSelectors } from '../materialization/barcode-selectors';
import type { RxDatabase } from 'rxdb';

/**
 * How a caller settles one terminal queue row.
 *  - 'retry-with-server-base' — 'conflicted' / 'needs-revision' only: re-stamp
 *    the base to the server's current revision and re-pend the SAME intent.
 *  - 'requeue-rebuilt' — 'rejected' only (#832): rebuild the payload from the
 *    current resident through the normal enqueue pipeline and queue THAT. The
 *    rejected payload is never re-sent; see `requeueRejectedMutation`.
 *  - 'discard' — any terminal row: drop the local intent, restore server truth.
 *    For a BORN-LOCAL create there is no server truth to restore and nothing will
 *    ever sync the record, so discard DESTROYS the resident too (#832 follow-up,
 *    R7b) rather than leaving a clean-flagged, permanently unsyncable ghost.
 */
export type ConflictResolutionChoice = 'retry-with-server-base' | 'requeue-rebuilt' | 'discard';

/**
 * Rejection verdicts that PROVE the server may already hold this record, even
 * though nothing local carries a remote id (#832 follow-up, R7b — raised by the
 * adversarial review).
 *
 * `identity-ambiguous` is the case that matters: the push adapter raises it when
 * the record's uuid resolves to MORE THAN ONE server record, and fails closed
 * rather than write an arbitrary match (`recordPushAdapter.ts`, the permanent 409).
 * The create is dead-lettered with no ack, so no `remoteId` is ever reconciled
 * onto the resident — the record looks born-local by every local signal while the
 * server demonstrably holds one or more matching orders. Destroying it there would
 * delete a real sale on the strength of an inference the client cannot make.
 *
 * "No remote id column" only ever meant "this client has not reconciled one". For
 * orders there is no pre-flight fetch to fall back on, so the verdict recorded at
 * dead-letter time is the only evidence available — and when it says the server
 * matched something, discard keeps the resident (#1011's behaviour) and lets a
 * pull reconcile it.
 */
const SERVER_MAY_HOLD_RECORD_REASONS = new Set(['identity-ambiguous']);

/**
 * Exported so the Store health panel decides "does discard delete this?" from the
 * SAME rule the engine enforces — a UI that promised destruction the engine then
 * refuses (or worse, the reverse) is how a cashier stops trusting the dialog.
 */
export function rejectionSuggestsServerRecord(reason: string | null | undefined): boolean {
	return typeof reason === 'string' && SERVER_MAY_HOLD_RECORD_REASONS.has(reason);
}

function serverMayHoldRecord(entry: { rejectedReason?: string }): boolean {
	return rejectionSuggestsServerRecord(entry.rejectedReason);
}

export type ConflictResolutionDeps = {
	assertUsable: () => void;
	settled: (kind: 'read' | 'write') => Promise<void>;
	manager: StoreScopeManager;
	databaseFor: (scopeId: string) => RxDatabase | null;
	fetcher: (url: string, init?: RequestInit) => Promise<Response>;
	syncBaseUrl: string;
	now: () => number;
	/** Mints the fresh mutationId a rebuilt requeue must carry (#832). */
	mintUuid: () => string;
	diagnostics: SyncObserver;
	persistOrderRepull: (input: {
		database: RxDatabase;
		remoteIds: RemoteId[];
		nowMs?: number;
	}) => Promise<void>;
	repullOrdersNow: (input: { remoteIds: RemoteId[]; reason: string }) => Promise<void>;
	queueFor: (database: RxDatabase) => RecordMutationQueue;
	resolutionInstanceIdFor: () => string;
	serializeResolution: <T>(op: () => Promise<T>) => Promise<T>;
	onQueueChanged: (database: RxDatabase | null) => Promise<void>;
	/** The active scope's barcode carriers — a discard rebuilds the optimistic
	 * document through the same projection an ordinary pull uses. */
	barcodeSelectorsFor?: (scopeId: string) => BarcodeSelectors | null;
};

export type ConflictResolution = {
	conflicts(): Promise<QueuedMutation[]>;
	resolveConflict(mutationId: string, resolution: ConflictResolutionChoice): Promise<void>;
};

export function createConflictResolution(deps: ConflictResolutionDeps): ConflictResolution {
	// prettier-ignore
	const { assertUsable, settled, manager, databaseFor, fetcher, syncBaseUrl, now, mintUuid, diagnostics, persistOrderRepull, repullOrdersNow, queueFor, resolutionInstanceIdFor, serializeResolution, onQueueChanged } = deps;
	const activeDatabase = (): RxDatabase | null => {
		const scopeId = manager.activeScope;
		return scopeId === null ? null : databaseFor(scopeId);
	};
	/** The carriers of the scope this resolution is BOUND to — never a later active one. */
	const boundBarcodeSelectors = (scopeId: string): BarcodeSelectors | undefined =>
		deps.barcodeSelectorsFor?.(scopeId) ?? undefined;

	// The write plane's in-process `serializeResolution` orders THIS window's resolutions. Two
	// Electron windows are two processes over one storage, and neither chain sees
	// the other — so the same discard-vs-requeue interleave reappears across
	// windows. The durable resolution CLAIM closes it (task 43): before a
	// resolution reads anything it takes a revision-checked claim on the row, which
	// exactly one window can hold; the other is refused and asks the cashier to
	// retry. `resolutionInstanceIdFor` distinguishes the two windows and is minted lazily — a
	// read-only engine may open on a host without Web Crypto, where `mintUuid`
	// throws, and an engine that never resolves must not pay for an id it never uses.
	const nowMs = now;
	// Long enough to cover a real resolution (a discard can fetch a server document
	// and seed a scheduler task); short enough that a window which crashes
	// mid-resolution does not stall recovery for a whole shift.
	const RESOLUTION_CLAIM_MS = 30_000;

	return {
		conflicts: async () => {
			assertUsable();
			await settled('read');
			const database = activeDatabase();
			if (!database) return [];
			return (await queueFor(database).all()).filter(
				(entry) =>
					entry.status === 'conflicted' ||
					entry.status === 'needs-revision' ||
					entry.status === 'rejected'
			);
		},
		resolveConflict: async (mutationId: string, resolution: ConflictResolutionChoice) => {
			// Captured BEFORE the resolution chain is joined. `runGuarded` takes its
			// scope ticket synchronously when it is CALLED, and serializing delays that
			// call until every queued resolution ahead of this one has finished — long
			// enough for the cashier to switch stores. The resolution would then bind to
			// the store that is active when its turn arrives, not the one whose Store
			// health screen the cashier pressed the button on. Serialization must not
			// change which store a resolution applies to, so the issuing scope is pinned
			// here and verified once the turn is granted.
			const issuedAgainst = activeDatabase();
			return serializeResolution(async () => {
				assertUsable();
				await settled('read');
				// Scope-guarded like write(): the resolution writes into the captured
				// scope's queue + record, and a switch/reset mid-resolution drops them.
				let needsRepull: RemoteId | null = null;
				let residentRemoved = false;
				let resolved: { collectionName: string; recordId: string } | null = null;
				let claimedQueue: ReturnType<typeof queueFor> | null = null;
				let claimTaken = false;
				try {
					await manager.runGuarded(async (bound) => {
						const database = databaseFor(bound.scopeId);
						if (!database) throw new Error('resolveConflict: scope database not open');
						if (issuedAgainst !== null && database !== issuedAgainst) {
							throw new Error(
								'resolveConflict: the active store changed while this resolution was queued — reopen Store health and retry against the settled store'
							);
						}
						const queue = queueFor(database);
						const entry = (await queue.all()).find((item) => item.mutationId === mutationId);
						if (
							!entry ||
							(entry.status !== 'conflicted' &&
								entry.status !== 'needs-revision' &&
								entry.status !== 'rejected')
						) {
							throw new Error(`resolveConflict: terminal mutation "${mutationId}" not found`);
						}
						// DURABLE CROSS-PROCESS CLAIM (task 43): take it BEFORE any decision is
						// read, on the same revision-checked write that guarantees exactly one
						// holder across windows. Released in the `finally` below whatever happens.
						claimedQueue = queue;
						const claim = await queue.claimForResolution({
							mutationId,
							expectedStatus: entry.status,
							holder: resolutionInstanceIdFor(),
							untilIso: new Date(nowMs() + RESOLUTION_CLAIM_MS).toISOString(),
							nowMs: nowMs(),
						});
						if (claim === 'gone') {
							throw new Error(`resolveConflict: terminal mutation "${mutationId}" not found`);
						}
						if (claim === 'held') {
							throw new Error(
								`resolveConflict: another window is resolving "${mutationId}" right now — wait for it to finish, then refresh the list`
							);
						}
						claimTaken = true;
						// A dead letter carries a payload the server has ALREADY permanently
						// refused. Re-pending that exact intent against a fresher base cannot
						// change the verdict — only a rebuild can (#832), so the two paths stay
						// strictly separated by status.
						if (resolution === 'retry-with-server-base' && entry.status === 'rejected') {
							throw new Error(
								'resolveConflict: rejected mutations can only be discarded or requeued (requeue-rebuilt)'
							);
						}
						if (resolution === 'requeue-rebuilt' && entry.status !== 'rejected') {
							throw new Error(
								`resolveConflict: requeue-rebuilt applies only to rejected mutations — "${mutationId}" is ${entry.status}`
							);
						}
						// The retry's base: a 'conflicted' row carries the 409's server
						// revision; a 'needs-revision' row (or a conflicted row whose 409
						// carried none — never a same-base retry loop, #516 item 4) FIRST
						// refreshes it from the server. The refresh is read-only and throws
						// on failure, leaving the row parked and re-runnable.
						let serverBase: string | null = null;
						if (resolution === 'retry-with-server-base') {
							serverBase = entry.conflictRevision ?? null;
							if (!serverBase) {
								const facet = writeFacetFor(entry.collectionName);
								if (!facet) {
									throw new Error(
										`resolveConflict: no server revision on "${mutationId}" and no refresh seam for "${entry.collectionName}" — discard instead`
									);
								}
								const row = (
									await database.collections[entry.collectionName]?.findOne(entry.recordId).exec()
								)?.toJSON() as Record<string, unknown> | undefined;
								const remoteId = remoteIdOrNull(row?.[facet.remoteIdField]);
								if (remoteId === null) {
									throw new Error(
										`resolveConflict: cannot refresh the server revision for "${mutationId}" — the record has no server identity; discard instead`
									);
								}
								if (entry.collectionName === 'orders') {
									serverBase = await fetchOrderServerRevision({
										fetch: bound.bindFetch(fetcher as never) as never,
										syncBaseUrl,
										remoteId: remoteId,
									});
								} else {
									const serverDocument = await facet.fetchServerDocument({
										fetch: bound.bindFetch(fetcher as never),
										syncBaseUrl,
										remoteId,
									});
									const refreshedRevision = (
										serverDocument?.sync as { revision?: unknown } | undefined
									)?.revision;
									serverBase =
										typeof refreshedRevision === 'string' && refreshedRevision !== ''
											? refreshedRevision
											: null;
								}
								if (!serverBase) {
									throw new Error(
										`resolveConflict: the server no longer returns record ${remoteId} — the row stays parked; retry later or discard`
									);
								}
							}
						}
						let discardServerDocument: Record<string, unknown> | null = null;
						let discardRemovesResident = false;
						if (resolution === 'discard' && entry.collectionName !== 'orders') {
							const facet = writeFacetFor(entry.collectionName);
							if (!facet) {
								throw new Error(
									`resolveConflict: no refresh seam for "${entry.collectionName}" — cannot discard safely`
								);
							}
							const row = (
								await database.collections[entry.collectionName]?.findOne(entry.recordId).exec()
							)?.toJSON() as Record<string, unknown> | undefined;
							const remoteId = remoteIdOrNull(
								row?.[facet.remoteIdField] ??
									(entry.payload as Record<string, unknown>).id ??
									(entry.conflictDocument as Record<string, unknown> | undefined)?.id
							);
							if (remoteId !== null) {
								// Discard WRITES this document back as server truth — without the
								// scope's carriers the restored row would lose its barcode.
								const barcodeSelectors = boundBarcodeSelectors(bound.scopeId);
								discardServerDocument = await facet.fetchServerDocument({
									fetch: bound.bindFetch(fetcher as never),
									syncBaseUrl,
									remoteId,
									...(barcodeSelectors !== undefined ? { barcodeSelectors } : {}),
								});
								// The server no longer has it: no truth to restore, so discard
								// tombstones the resident. A born-local create is decided separately,
								// INSIDE guardWrite — see `bornLocalCreate` below.
								discardRemovesResident = discardServerDocument === null;
							}
						}
						const applied = await bound.guardWrite(async () => {
							// Re-validate the claim before ANY terminal write (task 43 —
							// adversarial P1). The slow part of a resolution (fetching the
							// server base / document) runs BEFORE this guardWrite, so a claim
							// that expired during it — letting another window steal it — is
							// caught here, before the retry re-pends, the requeue rebuilds, or
							// the discard restores server truth. The destructive resident
							// removal re-checks again immediately before it, for a stall inside
							// guardWrite itself.
							const held = (await queue.all()).find((row) => row.mutationId === mutationId);
							const heldUntil = held?.resolutionClaimUntil
								? Date.parse(held.resolutionClaimUntil)
								: 0;
							if (held?.resolutionClaimBy !== resolutionInstanceIdFor() || heldUntil <= nowMs()) {
								throw new Error(
									`resolveConflict: the resolution claim on "${mutationId}" expired or was taken by another window — refresh the list and retry`
								);
							}
							if (resolution === 'retry-with-server-base') {
								// Back to pending on the SERVER's base (same mutationId — the intent
								// is unchanged, so the server-side replay key stays valid). Strip the
								// stored conflict + backoff bookkeeping: this is a fresh decision.
								const {
									conflictDocument: _document,
									conflictRevision: _revision,
									attempts: _attempts,
									nextAttemptAt: _gate,
									...intact
								} = entry;
								await queue.replace({
									...intact,
									baseRevision: serverBase ?? entry.baseRevision,
									status: 'pending',
								});
								// Re-anchor the resident record's sync.revision too — the drain
								// re-stamps from it at push time, and leaving the stale value there
								// would immediately clobber the base we just chose (a 409 loop).
								const doc = (await database.collections[entry.collectionName]
									?.findOne(entry.recordId)
									.exec()) as {
									incrementalModify(
										fn: (data: Record<string, unknown>) => Record<string, unknown>
									): Promise<unknown>;
								} | null;
								if (doc && serverBase) {
									const revision = serverBase;
									await doc.incrementalModify((data) => ({
										...data,
										sync: { ...((data.sync ?? {}) as object), revision },
									}));
								}
							} else if (resolution === 'requeue-rebuilt') {
								// Rebuild from the CURRENT resident through the normal enqueue
								// pipeline, then retire the dead letter (see requeueRejectedMutation
								// for why rebuild and not replay). Nothing else in this method
								// applies: a rejected write never reached the server, so there is no
								// server truth to adopt and no revision to re-anchor.
								await requeueRejectedMutation({
									db: database,
									entry,
									mintUuid,
									now: () => new Date(now()).toISOString(),
									observe: diagnostics,
								});
							} else {
								const doc = (await database.collections[entry.collectionName]
									?.findOne(entry.recordId)
									.exec()) as {
									toJSON(): Record<string, unknown>;
									incrementalModify(
										fn: (data: Record<string, unknown>) => Record<string, unknown>
									): Promise<unknown>;
									remove(): Promise<unknown>;
								} | null;
								const row = doc?.toJSON() as Record<string, unknown> | undefined;
								const facet = writeFacetFor(entry.collectionName);
								// BORN-LOCAL CREATE ⇒ discard DESTROYS the record (#832 follow-up,
								// ruling R7b). A rejected create never reached the server: there is no
								// server truth to restore and nothing will ever sync it again, so
								// leaving the resident behind strands a GHOST — clean-flagged, listed
								// in the app, permanently unsyncable. That is the exact failure class
								// #832 exists to end, and #1011 only fixed it for non-orders (orders
								// were excluded from the pre-flight block above), which is where the
								// whole incident lives.
								//
								// Decided HERE, inside guardWrite, from the SAME read that performs the
								// removal — not from the pre-flight read. A pull landing in between can
								// adopt a server identity for this record (matched on
								// `_woocommerce_pos_uuid`), and a record that HAS one is no longer
								// born-local: it exists server-side and must survive the discard.
								//
								// A rejected UPDATE always keeps its resident: that row is server
								// truth, and discard means "accept it".
								const remoteId = facet ? row?.[facet.remoteIdField] : undefined;
								const bornLocalCreate =
									entry.operation === 'create' &&
									doc !== null &&
									remoteIdOrNull(remoteId) === null &&
									// The pre-flight above resolves a remote id from the queued payload
									// too, and a server document coming back proves the record exists
									// there whatever the resident's column says. Never destroy that.
									// (Orders skip the pre-flight fetch entirely, so this is always
									// null for them and the resident's column decides alone — which is
									// exactly why `serverMayHoldRecord` below has to carry the weight.)
									discardServerDocument === null &&
									!serverMayHoldRecord(entry);
								const removesResident = discardRemovesResident || bornLocalCreate;
								// Destroying is only safe when NOTHING is queued to send for this
								// record. A live row means a push is pending or in flight, and for a
								// rejected CREATE the most likely live row is a recovery's own
								// replacement: destroy the resident anyway and the drain still pushes
								// the create, whose ack rematerializes the order the cashier just
								// confirmed destroying. `resolveConflict` is serialized so a requeue
								// cannot interleave mid-discard, but a replacement enqueued by an
								// EARLIER, already-returned requeue is still sitting there — this is
								// what catches it. Refuse and let the queue drain first.
								//
								// Bound to `removesResident`, NOT to `bornLocalCreate` (CodeRabbit,
								// PR #1016): the other destructive branch — a non-order record whose
								// `fetchServerDocument` came back null — deletes the resident just as
								// finally, and a successor queued against it lands in exactly the same
								// rematerialization the born-local guard exists to prevent. Every
								// destructive path takes the same check.
								// Only rows the DRAIN can actually send count. `pending()` also
								// returns terminal conflicted / needs-revision rows — including the
								// one being resolved right now — and those go nowhere without their
								// own explicit resolution; counting them would refuse every
								// server-gone discard of a conflicted row.
								if (removesResident) {
									const live = (await queue.pending()).filter(
										(item) =>
											item.collectionName === entry.collectionName &&
											item.recordId === entry.recordId &&
											item.mutationId !== mutationId &&
											(item.status === undefined ||
												item.status === 'pending' ||
												item.status === 'claimed')
									);
									if (live.length > 0) {
										throw new Error(
											`resolveConflict: ${entry.collectionName}/${entry.recordId} still has ${live.length} change(s) queued to send — deleting it now would let those recreate it; wait for the queue to drain, then discard`
										);
									}
								}
								// #516 item 5: queue the server-truth re-pull DURABLY *before*
								// clearing local state. A persisted targeted scheduler task
								// survives crashes and failed fetches (a failed task re-runs once
								// its retry gate elapses), so discard can never strand the record
								// silently posing as synced with the re-pull lost in memory.
								const orderRemoteId = remoteIdOrNull(remoteId);
								if (entry.collectionName === 'orders' && orderRemoteId !== null) {
									needsRepull = orderRemoteId;
									await persistOrderRepull({ database, remoteIds: [orderRemoteId], nowMs: now() });
								}
								if (entry.collectionName !== 'orders' && discardServerDocument) {
									if (!facet) {
										throw new Error(
											`resolveConflict: no refresh seam for "${entry.collectionName}" — cannot discard safely`
										);
									}
									let documentToApply = discardServerDocument;
									const successors = (await queue.pending()).filter(
										(mutation) =>
											mutation.collectionName === entry.collectionName &&
											mutation.recordId === entry.recordId &&
											mutation.mutationId !== mutationId
									);
									if (successors.length > 0) {
										const resident = doc?.toJSON();
										const serverPayload = (discardServerDocument.payload ?? {}) as Record<
											string,
											unknown
										>;
										const optimistic =
											resident ??
											facet.documentFromServerPayload(
												successors.reduce<Record<string, unknown>>(
													(payload, mutation) =>
														mutation.operation === 'delete'
															? payload
															: { ...payload, ...mutation.payload },
													serverPayload
												),
												boundBarcodeSelectors(bound.scopeId)
											);
										const local = (optimistic.local ?? {}) as {
											dirty?: boolean;
											pendingMutationIds?: string[];
										};
										const pendingMutationIds = [
											...new Set([
												...(Array.isArray(local.pendingMutationIds)
													? local.pendingMutationIds.filter((id) => id !== mutationId)
													: []),
												...successors.map((mutation) => mutation.mutationId),
											]),
										];
										documentToApply = {
											...discardServerDocument,
											...optimistic,
											[facet.remoteIdField]: discardServerDocument[facet.remoteIdField],
											payload: optimistic.payload,
											sync: {
												...((optimistic.sync ?? {}) as object),
												...((discardServerDocument.sync ?? {}) as object),
											},
											local: { ...local, pendingMutationIds, dirty: true },
										};
									}
									// Apply server truth BEFORE removing the terminal queue row. If
									// storage fails or the process stops, the durable conflict remains
									// retryable; there is no state where discard reports success while
									// the local row still poses as synced stale truth.
									await facet.upsertServerDocument(database, documentToApply);
								}
								// Destroy the resident BEFORE retiring the queue row, so a crash in
								// between leaves the dead letter listed against an absent record
								// (the panel then offers discard only, which completes the job) —
								// never a removed row beside a surviving ghost, which is
								// unrecoverable. Tolerated when the record is already gone: two
								// discards of one dead letter (a double-tap that beat the button's
								// disabled state, two windows) must not turn the loser into an error
								// toast over work that is already done.
								if (removesResident && doc) {
									// A STOLEN claim must never destroy a record another window is now
									// resolving (task 43 — the composition hole). Another window can
									// only steal this claim AFTER its deadline, so being inside the
									// deadline proves we still hold it exclusively; re-read the row to
									// confirm it still carries OUR claim (defense in depth against a
									// window that stalled past its own deadline). If it does not, abort
									// before the irreversible removal — the row is in another window's
									// hands, and its resolution will finish the job.
									const fresh = (await queue.all()).find((row) => row.mutationId === mutationId);
									const claimUntil = fresh?.resolutionClaimUntil
										? Date.parse(fresh.resolutionClaimUntil)
										: 0;
									if (
										fresh?.resolutionClaimBy !== resolutionInstanceIdFor() ||
										claimUntil <= nowMs()
									) {
										throw new Error(
											`resolveConflict: the resolution claim on "${mutationId}" expired or was taken by another window mid-resolution — refresh the list and retry`
										);
									}
									try {
										await doc.remove();
										residentRemoved = true;
									} catch (error) {
										const stillResident = await database.collections[entry.collectionName]
											?.findOne(entry.recordId)
											.exec();
										if (stillResident) throw error;
										residentRemoved = true;
									}
								}
								// CAS, not an unconditional remove: two discards of one terminal row
								// (a double-tap that beat the button's disabled state, two windows)
								// would otherwise have the loser fail on a row the winner already
								// took. `false` means someone else settled it — the record is already
								// in the state this call asked for, so report success rather than
								// alarm a cashier about work that is done.
								await queue.removeIfStatus(mutationId, entry.status);
								if (doc && !removesResident) {
									await doc.incrementalModify((data) => {
										const local = (data.local ?? {}) as { pendingMutationIds?: string[] };
										const pendingMutationIds = (local.pendingMutationIds ?? []).filter(
											(id) => id !== mutationId
										);
										return {
											...data,
											local: { ...local, pendingMutationIds, dirty: pendingMutationIds.length > 0 },
										};
									});
								}
							}
						});
						if (applied === 'dropped') {
							throw new Error(
								'resolveConflict: scope moved during resolution — retry against the settled scope'
							);
						}
						resolved = { collectionName: entry.collectionName, recordId: entry.recordId };
					});
				} finally {
					// Release whatever happened — success, refusal, or throw. A resolution
					// that SUCCEEDED removed the row, so the release is a no-op (and must be:
					// re-writing would resurrect a retired dead letter). One that failed
					// hands the row straight back instead of parking it behind the deadline.
					if (claimTaken && claimedQueue) {
						await (claimedQueue as ReturnType<typeof queueFor>)
							.releaseResolutionClaim(mutationId, resolutionInstanceIdFor())
							.catch((error) => {
								// The release must never mask the try-block's outcome, and a failed
								// release self-heals at the lease deadline — but a storage failure
								// here is still a failure someone may be diagnosing, so it is
								// reported rather than swallowed silently (#1345).
								diagnostics({
									type: 'queue.write.tick.error',
									level: 'warn',
									message: `conflict-claim release failed (row stays claimed until the lease deadline): ${error instanceof Error ? error.message : String(error)}`,
									fields: { mutationId },
								});
							});
					}
				}
				// Discard chose server truth — attempt the re-pull's IMMEDIATE
				// completion (its own scope guard; outside ours). The durable task
				// seeded above is the guarantee: if this attempt cannot complete now, a
				// later scheduler-drain tick finishes it (#516 item 5). Born-local
				// creates have no Woo id and nothing server-side to restore.
				if (needsRepull !== null) {
					try {
						await repullOrdersNow({
							remoteIds: [needsRepull],
							reason: `conflict-discard:${mutationId}`,
						});
					} catch (error) {
						diagnostics({
							type: 'queue.write.discard-repull-deferred',
							level: 'warn',
							collection: 'orders',
							message: `discard re-pull deferred to the durable scheduler task: ${error instanceof Error ? error.message : String(error)}`,
							fields: { mutationId, remoteId: needsRepull },
						});
					}
				}
				const settledResolution = resolved as {
					collectionName: string;
					recordId: string;
				} | null;
				if (settledResolution) {
					diagnostics({
						type: 'queue.write.resolve',
						level: 'info',
						collection: settledResolution.collectionName,
						// `residentRemoved` makes a destructive discard legible in the log:
						// it is the one resolution that deletes a record outright, and "the
						// order is gone" must never be an unexplained disappearance (R7b).
						fields: {
							recordId: settledResolution.recordId,
							mutationId,
							resolution,
							residentRemoved,
						},
					});
					// The resolution changed queue state outside the drain path — refresh
					// the cached depth and tell status subscribers, or an idle engine
					// keeps showing the pre-resolution depth.
					await onQueueChanged(activeDatabase());
				}
			});
		},
	};
}
