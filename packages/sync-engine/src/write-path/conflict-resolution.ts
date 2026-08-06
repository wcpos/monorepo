import type { StoreScopeManager, SyncObserver } from '@wcpos/sync-core';

import { writeFacetFor } from '../collections/collection-descriptors';
import { seedTargetedOrderSchedulerTask } from '../scheduler';
import { fetchOrderServerRevision } from './write-drain-lane';
import { queueFor, requeueRejectedMutation } from './write-intents';

import type { EngineRequirement, RequirementHandle } from '../require-plane';
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
 * The create is dead-lettered with no ack, so no `wooOrderId` is ever reconciled
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

type ConflictResolutionDeps = {
	assertNotDisposed: () => void;
	readySettledForSync: Promise<void>;
	manager: StoreScopeManager;
	databaseByScopeId: ReadonlyMap<string, RxDatabase>;
	activeDatabase: () => RxDatabase | null;
	fetcher: (url: string, init?: RequestInit) => Promise<Response>;
	ports: { site: { syncBaseUrl: string }; now?: () => number };
	/** Mints the fresh mutationId a rebuilt requeue must carry (#832). */
	mintUuid: () => string;
	requirePlane: { require: (requirement: EngineRequirement) => RequirementHandle };
	diagnostics: SyncObserver;
	writeDrainLane: { noteQueueDepth: (depth: number) => void };
	scheduleStatusChange: () => void;
};

export function createConflictResolution(deps: ConflictResolutionDeps) {
	// prettier-ignore
	const { assertNotDisposed, readySettledForSync, manager, databaseByScopeId, activeDatabase, fetcher, ports, mintUuid, requirePlane, diagnostics, writeDrainLane, scheduleStatusChange } = deps;

	// Resolutions run ONE AT A TIME (#832 follow-up, R7b). Two different choices
	// racing on the same dead letter is not a hypothetical: requeue durably
	// enqueues its replacement BEFORE it retires the dead letter, so a discard
	// interleaving in that window destroys the resident while the replacement is
	// already queued — the drain then pushes the create and the ack's
	// missing-resident path REMATERIALIZES the order the cashier just confirmed
	// destroying. Neither side can unwind the other once the drain has claimed the
	// row, so the fix is to stop the interleave happening. Same idiom as the
	// queue's own transition chain: serialize, and let each resolution re-read
	// state inside its own turn (both paths already do).
	let resolutionChain: Promise<unknown> = Promise.resolve();
	const serialize = <T>(op: () => Promise<T>): Promise<T> => {
		const run = resolutionChain.then(op, op);
		resolutionChain = run.then(
			() => undefined,
			() => undefined
		);
		return run;
	};

	return {
		conflicts: async () => {
			assertNotDisposed();
			await readySettledForSync;
			const database = activeDatabase();
			if (!database) return [];
			return (await queueFor(database).all()).filter(
				(entry) =>
					entry.status === 'conflicted' ||
					entry.status === 'needs-revision' ||
					entry.status === 'rejected'
			);
		},
		resolveConflict: async (mutationId: string, resolution: ConflictResolutionChoice) =>
			serialize(async () => {
				assertNotDisposed();
				await readySettledForSync;
				// Scope-guarded like write(): the resolution writes into the captured
				// scope's queue + record, and a switch/reset mid-resolution drops them.
				let needsRepull: number | null = null;
				let residentRemoved = false;
				let resolved: { collectionName: string; recordId: string } | null = null;
				await manager.runGuarded(async (bound) => {
					const database = databaseByScopeId.get(bound.scopeId);
					if (!database) throw new Error('resolveConflict: scope database not open');
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
							const remoteId = row?.[facet.remoteIdField];
							if (typeof remoteId !== 'number') {
								throw new Error(
									`resolveConflict: cannot refresh the server revision for "${mutationId}" — the record has no server identity; discard instead`
								);
							}
							if (entry.collectionName === 'orders') {
								serverBase = await fetchOrderServerRevision({
									fetch: bound.bindFetch(fetcher as never) as never,
									syncBaseUrl: ports.site.syncBaseUrl,
									wooOrderId: remoteId,
								});
							} else {
								const serverDocument = await facet.fetchServerDocument({
									fetch: bound.bindFetch(fetcher as never),
									syncBaseUrl: ports.site.syncBaseUrl,
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
						const remoteId =
							row?.[facet.remoteIdField] ??
							(entry.payload as Record<string, unknown>).id ??
							(entry.conflictDocument as Record<string, unknown> | undefined)?.id;
						if (typeof remoteId === 'number') {
							discardServerDocument = await facet.fetchServerDocument({
								fetch: bound.bindFetch(fetcher as never),
								syncBaseUrl: ports.site.syncBaseUrl,
								remoteId,
							});
							// The server no longer has it: no truth to restore, so discard
							// tombstones the resident. A born-local create is decided separately,
							// INSIDE guardWrite — see `bornLocalCreate` below.
							discardRemovesResident = discardServerDocument === null;
						}
					}
					const applied = await bound.guardWrite(async () => {
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
								now: () =>
									new Date(ports.now !== undefined ? ports.now() : Date.now()).toISOString(),
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
								typeof remoteId !== 'number' &&
								// The pre-flight above resolves a remote id from the queued payload
								// too, and a server document coming back proves the record exists
								// there whatever the resident's column says. Never destroy that.
								// (Orders skip the pre-flight fetch entirely, so this is always
								// null for them and the resident's column decides alone — which is
								// exactly why `serverMayHoldRecord` below has to carry the weight.)
								discardServerDocument === null &&
								!serverMayHoldRecord(entry);
							// Destroying is only safe when NOTHING is queued to send for this
							// record. A live row means a push is pending or in flight, and for a
							// rejected CREATE the most likely live row is a recovery's own
							// replacement: destroy the resident anyway and the drain still pushes
							// the create, whose ack rematerializes the order the cashier just
							// confirmed destroying. `resolveConflict` is serialized so a requeue
							// cannot interleave mid-discard, but a replacement enqueued by an
							// EARLIER, already-returned requeue is still sitting there — this is
							// what catches it. Refuse and let the queue drain first.
							if (bornLocalCreate) {
								const live = (await queue.pending()).filter(
									(item) =>
										item.collectionName === entry.collectionName && item.recordId === entry.recordId
								);
								if (live.length > 0) {
									throw new Error(
										`resolveConflict: ${entry.collectionName}/${entry.recordId} still has ${live.length} change(s) queued to send — deleting it now would let those recreate it; wait for the queue to drain, then discard`
									);
								}
							}
							const removesResident = discardRemovesResident || bornLocalCreate;
							// #516 item 5: queue the server-truth re-pull DURABLY *before*
							// clearing local state. A persisted targeted scheduler task
							// survives crashes and failed fetches (a failed task re-runs once
							// its retry gate elapses), so discard can never strand the record
							// silently posing as synced with the re-pull lost in memory.
							if (entry.collectionName === 'orders' && typeof remoteId === 'number') {
								needsRepull = remoteId;
								await seedTargetedOrderSchedulerTask({
									orderIds: [remoteId],
									priority: 1_000,
									completedDedupeForMs: 0,
									...(ports.now !== undefined ? { nowMs: ports.now() } : {}),
									database: database,
								});
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
											)
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
				// Discard chose server truth — attempt the re-pull's IMMEDIATE
				// completion (its own scope guard; outside ours). The durable task
				// seeded above is the guarantee: if this attempt cannot complete now, a
				// later scheduler-drain tick finishes it (#516 item 5). Born-local
				// creates have no Woo id and nothing server-side to restore.
				if (needsRepull !== null) {
					try {
						await requirePlane.require({
							id: `conflict-discard:${mutationId}`,
							collection: 'orders',
							kind: 'targeted-records',
							wooIds: [needsRepull],
							forceRefresh: true,
							priority: 1_000,
						}).ready;
					} catch (error) {
						diagnostics({
							type: 'queue.write.discard-repull-deferred',
							level: 'warn',
							collection: 'orders',
							message: `discard re-pull deferred to the durable scheduler task: ${error instanceof Error ? error.message : String(error)}`,
							fields: { mutationId, wooOrderId: needsRepull },
						});
					}
				}
				const settled = resolved as { collectionName: string; recordId: string } | null;
				if (settled) {
					diagnostics({
						type: 'queue.write.resolve',
						level: 'info',
						collection: settled.collectionName,
						// `residentRemoved` makes a destructive discard legible in the log:
						// it is the one resolution that deletes a record outright, and "the
						// order is gone" must never be an unexplained disappearance (R7b).
						fields: { recordId: settled.recordId, mutationId, resolution, residentRemoved },
					});
					// The resolution changed queue state outside the drain path — refresh
					// the cached depth and tell status subscribers, or an idle engine
					// keeps showing the pre-resolution depth.
					const database = activeDatabase();
					if (database) {
						writeDrainLane.noteQueueDepth((await queueFor(database).pending()).length);
					}
					scheduleStatusChange();
				}
			}),
	};
}
