/**
 * The write-drain lane (facade slice 4): one deterministic, scope-guarded
 * tick = drain the ACTIVE scope's durable mutation queue through the push
 * adapter with ADR 0012 backoff, applying each ack through the descriptor
 * write facet. Push outcomes surface as ENGINE EVENTS
 * (`write-acknowledged` / `write-conflict` / `write-rejected`) — `write()`
 * resolved long ago, at enqueue (ADR 0018 durable-enqueue semantics).
 *
 * Semantics carried from sync-core's drain (the single source of the loop):
 * each attempt re-stamps its baseRevision from the record's CURRENT
 * sync.revision (the `currentRevision` port below reads it) so an edit queued
 * behind an in-flight ack pushes against the re-anchored base; a 409
 * stale-revision conflict transitions the row to durable 'conflicted' (server
 * truth stored on it — the facade's conflicts()/resolveConflict surface) and
 * LEAVES the drain, holding later edits to the record; an unrecoverable 428
 * (the revision refresh below finds nothing) parks
 * as durable 'needs-revision' on the same surface (#516 item 4 — resolution
 * refreshes the revision first, never a same-base retry); a 428 that persists
 * after the one targeted refresh/retry is dead-lettered. A permanent 4xx also
 * dead-letters to durable 'rejected' — this lane then clears the record's
 * pendingMutationIds/dirty bookkeeping so the record is syncable again, while
 * the row persists into conflicts() with discard as its resolution; transient
 * failures back off with persisted attempts/nextAttemptAt. The queue itself
 * lives per scope database, so it survives switch and reset by placement
 * (invariant 2 — the mutation-queue reset confirmation is the manager's,
 * unchanged).
 */

import {
	drainMutationQueue,
	pushEndpointResolver,
	pushRecordMutation,
	reconcileCreateAck,
} from '@wcpos/sync-core';
import type { Fetcher, QueuedMutation, StoreScopeManager, SyncObserver } from '@wcpos/sync-core';

import { type WriteAck, writeFacetFor } from '../collections/collection-descriptors';
import {
	compareOrderMoney,
	type MoneyDivergenceField,
	type MoneyPrecisionMode,
} from './order-money-divergence';
import { queueFor, requeueBornTwiceSnapshot } from './write-intents';
import { orderDocumentFromWooPayload } from '../scheduler';

import type { SyncCollectionName } from '../collections/engine-collections';
import type { EngineSourceFetcher } from '../change-signal/change-signal-source';
import type { RxDatabase } from 'rxdb';

/**
 * The OUTGOING half of the #818 identity graft: re-stamp the record's known
 * server line ids onto the envelope about to be pushed.
 *
 * Queue payloads are FROZEN at enqueue, so a mutation enqueued before its
 * record had server identity — the classic case, an edit made while the create
 * was still in flight — carries ID-LESS `line_items`, and WooCommerce APPENDS
 * those as new items (duplicated cart, multiplied total, real money). The
 * resident learned that identity when the create was acked (`reconcile`'s
 * graft), so the resident is the authority here: whatever ids it holds are
 * stamped onto the outgoing payload, and nothing else about it is read.
 *
 * Doing this at PUSH time rather than rewriting the queue rows is deliberate.
 * The durable row stays the honest record of what the cashier intended; no
 * mutationId is re-minted (a swap would strand `awaitWriteOutcome` callers
 * holding a receipt that could then never settle) and no row is deferred a
 * tick. It also closes the race by construction: the graft reads the freshest
 * resident at the moment of the push, so no ack landing in between can outrun
 * it — including one that rewrote the queue row through coalescing.
 *
 * @param database - The active scope database.
 * @param mutation - The claimed mutation the drain is about to push.
 * @returns The mutation, payload grafted when the resident knows more.
 */
async function withGraftedLineIdentity<T extends QueuedMutation>(
	database: RxDatabase,
	mutation: T
): Promise<T> {
	const facet = writeFacetFor(mutation.collectionName);
	if (!facet?.graftAckIdentity || mutation.operation === 'delete') return mutation;
	const resident = await database.collections[mutation.collectionName]
		?.findOne(mutation.recordId)
		.exec();
	const residentPayload = (resident?.toJSON() as { payload?: unknown } | undefined)?.payload;
	if (typeof residentPayload !== 'object' || residentPayload === null) return mutation;
	const payload = (mutation.payload ?? {}) as Record<string, unknown>;
	const grafted = facet.graftAckIdentity(payload, residentPayload as Record<string, unknown>);
	return grafted === payload ? mutation : { ...mutation, payload: grafted };
}

/**
 * One targeted, read-only fetch of an order's CURRENT server revision (the
 * 428-recovery seam). Shared by the drain's `refreshRevision` port and the
 * facade's resolveConflict refresh-first retry on a 'needs-revision' row —
 * both must observe the same server truth the same way. Returns null when the
 * server no longer returns the record; throws on a transport/HTTP failure.
 */
export async function fetchOrderServerRevision(input: {
	fetch: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
	syncBaseUrl: string;
	wooOrderId: number;
}): Promise<string | null> {
	// No `dp` — see the monetary-precision note in rx-scheduler-order-fetcher (#946). This
	// read is the sharpest case: it exists ONLY to adopt the server's stamped revision, so a
	// `dp`-shifted payload here would hand the drain a hash the push side can never match.
	const response = await input.fetch(
		`${input.syncBaseUrl}/orders?include=${input.wooOrderId}&per_page=1&orderby=include`
	);
	if (!response.ok) throw new Error(`revision refresh failed: HTTP ${response.status}`);
	const [payload] = (await response.json()) as Record<string, unknown>[];
	if (!payload) return null;
	return orderDocumentFromWooPayload(payload as never).sync.revision || null;
}

/**
 * The R1 save-time mirror check, as an ack candidate.
 *
 * Compares the PUSHED envelope payload with the ACK document — never the resident,
 * which moves under an in-flight push (coupon replay, a fee recalculation, the
 * cart's own totals patch) and would make ordinary cart activity look like server
 * divergence. Returns null when there is nothing to report, so the caller stages
 * one event or none.
 *
 * @param input.mutation - The mutation whose ack just landed.
 * @param input.document - The server document from that ack, or null.
 * @param input.bornTwice - True when the server answered 200 to a create and
 *   DISCARDED the pushed payload; its document answers a different write, so
 *   comparing them would report a divergence that never happened.
 */
function orderMoneyDivergenceEvent(input: {
	mutation: QueuedMutation;
	document: Record<string, unknown> | null;
	bornTwice: boolean;
}): Extract<WriteOutcomeEvent, { type: 'order-money-divergence' }> | null {
	const { mutation, document, bornTwice } = input;
	if (mutation.collectionName !== 'orders' || mutation.operation === 'delete') return null;
	if (bornTwice || document === null) return null;
	const pushed = mutation.payload;
	if (typeof pushed !== 'object' || pushed === null || Array.isArray(pushed)) return null;
	const divergence = compareOrderMoney({
		pushed: pushed as Record<string, unknown>,
		acked: document,
	});
	if (!divergence) return null;
	return {
		type: 'order-money-divergence',
		collection: mutation.collectionName,
		recordId: mutation.recordId,
		mutationId: mutation.mutationId,
		mode: divergence.mode,
		fields: divergence.fields,
	};
}

function revisionOf(document: Record<string, unknown> | null): string | null {
	const revision = (document?.sync as { revision?: unknown } | undefined)?.revision;
	return typeof revision === 'string' && revision !== '' ? revision : null;
}

export type WriteOutcomeEvent =
	| {
			type: 'write-acknowledged';
			collection: string;
			recordId: string;
			mutationId: string;
			currentRevision: string | null;
	  }
	| {
			type: 'write-ack-rematerialized';
			collection: string;
			recordId: string;
			mutationId: string;
			currentRevision: string | null;
	  }
	| {
			type: 'write-conflict';
			collection: string;
			recordId: string;
			mutationId: string;
			currentRevision: string | null;
	  }
	| {
			type: 'write-rejected';
			collection: string;
			recordId: string;
			mutationId: string;
			status?: number;
			reason?: string;
	  }
	/**
	 * R1: the server ACKED an order the POS built, but the money it returned is not
	 * the money that was sent. WooCommerce's calculation is the source of truth and
	 * the POS mirrors it — so this is the mirror breaking, and the cashier has to see
	 * it before goods leave the counter.
	 *
	 * NOT terminal: the write succeeded, `write-acknowledged` still follows, and the
	 * server's totals stand. This is an anomaly report riding alongside the outcome,
	 * never a replacement for it.
	 */
	| {
			type: 'order-money-divergence';
			collection: string;
			recordId: string;
			mutationId: string;
			mode: MoneyPrecisionMode;
			fields: MoneyDivergenceField[];
	  };

export type WriteDrainReport = {
	lane: 'write-drain';
	status: 'ran' | 'skipped' | 'error';
	reason?: string;
	error?: string;
	pushed?: number;
	/** Never-pushed create→delete chains cancelled at drain before any push (#1059). */
	annihilated?: number;
	held?: number;
	conflicts?: number;
	deferred?: number;
	failed?: number;
	rejected?: number;
};

export type WriteDrainLaneDeps = {
	manager: StoreScopeManager;
	databaseFor: (scopeId: string) => RxDatabase | null;
	fetcher: EngineSourceFetcher;
	/** Configured versioned WCPOS sync base used by pushes and targeted revision refreshes. */
	syncBaseUrl: string;
	connectivity: () => 'online' | 'offline' | 'degraded';
	diagnostics: SyncObserver;
	onActivityChange?: (collection: SyncCollectionName, delta: 1 | -1) => void;
	emitWriteEvent: (event: WriteOutcomeEvent) => void;
	now?: () => number;
};

export type WriteDrainLane = {
	tick(signal?: AbortSignal): Promise<WriteDrainReport>;
	/** Pending mutation count of the ACTIVE scope, cached from the last tick/enqueue. */
	lastKnownQueueDepth(): number | null;
	noteQueueDepth(depth: number): void;
	lastError(): string | null;
};

export function createWriteDrainLane(deps: WriteDrainLaneDeps): WriteDrainLane {
	let chain: Promise<unknown> = Promise.resolve();
	let lastError: string | null = null;
	let queueDepth: number | null = null;
	// This drain instance's id for the durable claim lease (task 43 follow-up):
	// one per lane, so two Electron windows mint different ids and cannot both hold
	// one row's claim. Minted lazily on first use — the lane may be constructed on a
	// host without Web Crypto, and a lane that never drains must not pay for an id.
	let drainInstanceIdOnce: string | null = null;
	const drainInstanceIdFor = (): string => (drainInstanceIdOnce ??= globalThis.crypto.randomUUID());

	async function runTick(signal?: AbortSignal): Promise<WriteDrainReport> {
		if (signal?.aborted) {
			return { lane: 'write-drain', status: 'skipped', reason: 'aborted' };
		}
		if (deps.connectivity() === 'offline') {
			return { lane: 'write-drain', status: 'skipped', reason: 'offline' };
		}
		if (deps.manager.activeScope === null) {
			return { lane: 'write-drain', status: 'skipped', reason: 'no active scope' };
		}
		try {
			return await deps.manager.runGuarded(async (bound) => {
				const database = deps.databaseFor(bound.scopeId);
				if (!database) {
					return {
						lane: 'write-drain' as const,
						status: 'skipped' as const,
						reason: 'scope database not open',
					};
				}
				const queue = queueFor(database);
				const resolveEndpoint = pushEndpointResolver(deps.syncBaseUrl);
				// A switch/reset mid-drain must read as CANCELLATION, not failure —
				// without a signal the drain would classify the aborted push as a
				// retryable error and bump the backoff. The controller mirrors the
				// scope lifecycle for exactly this tick.
				const tickAbort = new AbortController();
				const abortTick = () => tickAbort.abort();
				// Abort listeners do not replay: a caller that aborted while runTick
				// awaited runGuarded must abort the tick NOW, not never.
				if (bound.signal.aborted || signal?.aborted) {
					abortTick();
				} else {
					bound.signal.addEventListener('abort', abortTick, { once: true });
					signal?.addEventListener('abort', abortTick, { once: true });
				}
				// Per-request signal combining happens HERE, below bindFetch, with a
				// manual controller: AbortSignal.any is unavailable on RN/Expo fetch
				// polyfills (the StoreScopeManager contract — a bound fetcher must
				// never receive init.signal, which would force AbortSignal.any inside
				// scopedFetch). scopedFetch hands the TICKET signal down as
				// init.signal; merge it with this tick's controller and forward ONE
				// composite to the raw transport.
				const tickFetcher: Fetcher = async (url, init) => {
					const ticketSignal = init?.signal;
					const combined = new AbortController();
					const abort = () => combined.abort();
					if (ticketSignal?.aborted || tickAbort.signal.aborted) {
						abort();
					} else {
						ticketSignal?.addEventListener('abort', abort, { once: true });
						tickAbort.signal.addEventListener('abort', abort, { once: true });
					}
					try {
						return await (deps.fetcher as Fetcher)(url, { ...init, signal: combined.signal });
					} finally {
						ticketSignal?.removeEventListener('abort', abort);
						tickAbort.signal.removeEventListener('abort', abort);
					}
				};
				const rawBoundFetch = bound.bindFetch(tickFetcher);
				// Pull helpers thread the tick signal for between-request cancellation,
				// but a scope-bound fetcher must not receive it: scopedFetch would use
				// AbortSignal.any, which RN/Expo does not provide. tickFetcher already
				// merges the scope ticket with tickAbort below bindFetch.
				const boundFetch: Fetcher = (url, init) => {
					const { signal: _absorbed, ...rest } = (init ?? {}) as {
						signal?: AbortSignal;
					} & Record<string, unknown>;
					return rawBoundFetch(url, rest as never);
				};
				// Ack events fire only AFTER the drain durably removed the mutation:
				// an ack whose queue-remove failed stays queued and re-pushes (the
				// server dedupes on mutationId) — eventing it early would announce an
				// acknowledgement the queue does not yet agree with.
				const ackCandidates: WriteOutcomeEvent[] = [];
				let report: WriteDrainReport = { lane: 'write-drain', status: 'ran' };
				let activeCollection: SyncCollectionName | null = null;
				const activateCollection = (collection: SyncCollectionName): void => {
					if (activeCollection === collection) return;
					if (activeCollection !== null) deps.onActivityChange?.(activeCollection, -1);
					activeCollection = collection;
					deps.onActivityChange?.(collection, 1);
				};
				const wrote = await bound
					.guardWrite(async () => {
						const result = await drainMutationQueue({
							queue,
							signal: tickAbort.signal,
							shouldHold: async (mutation) => {
								if (
									(mutation.status !== undefined && mutation.status !== 'pending') ||
									mutation.collectionName !== 'orders' ||
									mutation.operation === 'delete' ||
									mutation.explicit === true
								)
									return false;
								const doc = await database.collections.orders?.findOne(mutation.recordId).exec();
								const row = doc?.toJSON() as { status?: unknown } | undefined;
								return row?.status === 'pos-open';
							},
							currentRevision: async (mutation) => {
								const doc = await database.collections[mutation.collectionName]
									?.findOne(mutation.recordId)
									.exec();
								const row = doc?.toJSON() as { sync?: { revision?: string } } | undefined;
								return row?.sync?.revision;
							},
							// LEADER-SIDE ANNIHILATION (#1059): drop the local resident when the
							// drain cancels a never-pushed create→delete chain. `onDeleteAck` is
							// exactly "the record is gone, remove the local doc" (it does one
							// `doc.remove()`, no server round-trip) — the same net local effect as
							// enqueue-time annihilation's `resident.remove()`. Only runs on the
							// leader: this lane ticks only when writePlaneOwner() is true.
							removeResident: async (mutation, signal) => {
								const facet = writeFacetFor(mutation.collectionName);
								if (!facet) return; // enqueue guards this; nothing to remove otherwise
								await facet.onDeleteAck(
									database,
									{ mutationId: mutation.mutationId, recordId: mutation.recordId },
									signal
								);
							},
							refreshRevision: async (mutation) => {
								const facet = writeFacetFor(mutation.collectionName);
								if (!facet) {
									throw new Error(`No refresh seam for collection "${mutation.collectionName}"`);
								}
								const doc = await database.collections[mutation.collectionName]
									?.findOne(mutation.recordId)
									.exec();
								const row = doc?.toJSON() as Record<string, unknown> | undefined;
								const remoteId = row?.[facet.remoteIdField];
								if (typeof remoteId !== 'number') return null;
								const revision =
									mutation.collectionName === 'orders'
										? await fetchOrderServerRevision({
												fetch: boundFetch,
												syncBaseUrl: deps.syncBaseUrl,
												wooOrderId: remoteId,
											})
										: revisionOf(
												await facet.fetchServerDocument({
													fetch: boundFetch,
													syncBaseUrl: deps.syncBaseUrl,
													remoteId,
													signal: tickAbort.signal,
												})
											);
								if (!revision) return null;
								await doc?.incrementalModify((data: Record<string, unknown>) => ({
									...data,
									sync: { ...((data.sync ?? {}) as object), revision },
								}));
								return revision;
							},
							push: async (mutation) => {
								activateCollection(mutation.collectionName as SyncCollectionName);
								return pushRecordMutation({
									mutation: await withGraftedLineIdentity(database, mutation),
									resolveEndpoint,
									fetcher: (url, init) => {
										// Absorb the adapter's signal — tickFetcher already merged
										// it; forwarding would force AbortSignal.any in scopedFetch.
										const { signal: _absorbed, ...rest } = (init ?? {}) as {
											signal?: AbortSignal;
										} & Record<string, unknown>;
										return boundFetch(url, rest as never);
									},
									signal: tickAbort.signal,
									observe: deps.diagnostics,
								});
							},
							applyAck: async (mutation, pushResult, signal) => {
								const facet = writeFacetFor(mutation.collectionName);
								if (!facet) {
									// Enqueue guards against this; a foreign row (older build) must
									// not silently ack — leave it queued and surface loudly.
									throw new Error(
										`No write facet for collection "${mutation.collectionName}" — mutation left queued`
									);
								}
								if (mutation.operation === 'delete') {
									await facet.onDeleteAck(
										database,
										{ mutationId: mutation.mutationId, recordId: mutation.recordId },
										signal
									);
								} else {
									const { recordId, remoteId } = reconcileCreateAck(mutation, pushResult.document);
									const resident = await database.collections[mutation.collectionName]
										?.findOne(recordId)
										.exec();
									if (!resident) {
										if (!pushResult.document) {
											throw new Error(
												`Cannot reconcile ${mutation.collectionName}/${recordId}: ack target is not resident and no materializable server document was returned`
											);
										}
										await facet.upsertServerDocument(
											database,
											facet.documentFromServerPayload(pushResult.document)
										);
										ackCandidates.push({
											type: 'write-ack-rematerialized',
											collection: mutation.collectionName,
											recordId,
											mutationId: mutation.mutationId,
											currentRevision: pushResult.currentRevision,
										});
									}
									const bornTwiceCreate =
										mutation.operation === 'create' && pushResult.httpStatus === 200;
									const ack: WriteAck = {
										mutation: {
											mutationId: mutation.mutationId,
											operation: mutation.operation,
											recordId: mutation.recordId,
										},
										recordId,
										remoteId,
										currentRevision: pushResult.currentRevision,
										// A born-twice ack document is the EXISTING server record and
										// the pushed payload was DISCARDED — adopting it here would
										// overwrite the resident's local edit before the follow-up
										// below re-lands it. Withhold it from the payload adoption.
										document: bornTwiceCreate ? null : (pushResult.document ?? null),
										// …but NEVER withhold it from the IDENTITY graft (#818): the server's
										// line ids are facts about the record, safe to learn from any ack —
										// only its VALUES are unsafe to adopt over a local edit. The
										// born-twice follow-up must carry them or Woo appends the re-landed
										// snapshot as new lines.
										identityDocument: pushResult.document ?? null,
									};
									await facet.reconcile(database, ack, signal);
									// R1: stage the save-time mirror check next to the outcome it
									// belongs to. STAGED, not emitted, for the same reason as the
									// ack itself — a divergence announced for a mutation the queue
									// has not yet released would fire again on the re-push.
									const divergence = orderMoneyDivergenceEvent({
										mutation,
										document: pushResult.document ?? null,
										bornTwice: bornTwiceCreate,
									});
									if (divergence) ackCandidates.push(divergence);
									// BORN-TWICE honest reconcile (gate2 #516 item 1): a create the
									// server answered 200 (not 201) matched an EXISTING document —
									// the pushed payload was DISCARDED by the born-twice guard.
									// Acking clean would silently lose the edit; re-land it as a
									// follow-up update (see requeueBornTwiceSnapshot's docblock for
									// the outcome-code comparison design and the successor layering).
									if (bornTwiceCreate) {
										await requeueBornTwiceSnapshot({
											db: database,
											mutation,
											ackRevision: pushResult.currentRevision,
											mintUuid: () => globalThis.crypto.randomUUID(),
											now: () =>
												new Date(deps.now !== undefined ? deps.now() : Date.now()).toISOString(),
											observe: deps.diagnostics,
										});
									}
								}
								ackCandidates.push({
									type: 'write-acknowledged',
									collection: mutation.collectionName,
									recordId: mutation.recordId,
									mutationId: mutation.mutationId,
									currentRevision: pushResult.currentRevision,
								});
							},
							observe: deps.diagnostics,
							drainInstanceId: drainInstanceIdFor(),
							...(deps.now !== undefined ? { now: deps.now } : {}),
						});
						const stillPending = new Set((await queue.pending()).map((m) => m.mutationId));
						for (const ack of ackCandidates) {
							if (stillPending.has(ack.mutationId)) continue;
							// A broken money mirror is a TERMINAL anomaly, not a transient step
							// the arc later settles, so it logs at error (#899's outcome-based
							// rule) and stamps its own outcome rather than letting the observer
							// derive one. It rides the same still-pending gate as the event, so
							// the durable row and the UI alert can never disagree about whether
							// it happened.
							if (ack.type === 'order-money-divergence') {
								deps.diagnostics({
									type: 'push.money-divergence',
									level: 'error',
									collection: ack.collection,
									message: `order ${ack.recordId} — the server's totals differ from the POS calculation`,
									fields: {
										recordId: ack.recordId,
										mutationId: ack.mutationId,
										outcome: 'failed',
										mode: ack.mode,
										divergentFields: ack.fields.map((field) => field.field).join(','),
										detail: ack.fields
											.map((field) => `${field.field}: ${field.expected} -> ${field.got}`)
											.join('; '),
									},
								});
							}
							deps.emitWriteEvent(ack);
						}
						for (const conflict of result.conflicts) {
							deps.emitWriteEvent({
								type: 'write-conflict',
								collection: conflict.mutation.collectionName,
								recordId: conflict.mutation.recordId,
								mutationId: conflict.mutation.mutationId,
								currentRevision: conflict.currentRevision,
							});
						}
						for (const { mutation: dead, status, reason } of result.rejected) {
							// Dead-letter cleanup (#507 D): the rejected mutation will never
							// push, so drop it from the record's pendingMutationIds (+ dirty
							// when empty) — the pull-apply guard frees the record and the next
							// pull restores server truth. The queue row itself persists as
							// status 'rejected' for the conflicts() surface.
							const doc = (await database.collections[dead.collectionName]
								?.findOne(dead.recordId)
								.exec()) as {
								incrementalModify(
									fn: (data: Record<string, unknown>) => Record<string, unknown>
								): Promise<unknown>;
							} | null;
							if (doc)
								await doc.incrementalModify((data) => {
									const local = (data.local ?? {}) as { pendingMutationIds?: string[] };
									const pendingMutationIds = (local.pendingMutationIds ?? []).filter(
										(id) => id !== dead.mutationId
									);
									return {
										...data,
										local: { ...local, pendingMutationIds, dirty: pendingMutationIds.length > 0 },
									};
								});
							deps.emitWriteEvent({
								type: 'write-rejected',
								collection: dead.collectionName,
								recordId: dead.recordId,
								mutationId: dead.mutationId,
								status,
								reason,
							});
						}
						queueDepth = stillPending.size;
						report = {
							lane: 'write-drain',
							status: 'ran',
							pushed: result.pushed,
							annihilated: result.annihilated,
							held: result.held,
							conflicts: result.conflicts.length,
							deferred: result.deferred,
							failed: result.failed,
							rejected: result.rejected.length,
						};
					})
					.finally(() => {
						bound.signal.removeEventListener('abort', abortTick);
						signal?.removeEventListener('abort', abortTick);
						if (activeCollection !== null) deps.onActivityChange?.(activeCollection, -1);
					});
				if (wrote === 'dropped') {
					report = {
						lane: 'write-drain',
						status: 'skipped',
						reason: 'scope moved mid-tick (writes dropped)',
					};
				}
				lastError = null;
				return report;
			});
		} catch (error) {
			if (signal?.aborted) {
				lastError = null;
				return { lane: 'write-drain', status: 'skipped', reason: 'aborted' };
			}
			const message = error instanceof Error ? error.message : String(error);
			lastError = message;
			deps.diagnostics({ type: 'queue.write.tick.error', level: 'error', message });
			return { lane: 'write-drain', status: 'error', error: message };
		}
	}

	return {
		tick: (signal) => {
			const run = chain.then(
				() => runTick(signal),
				() => runTick(signal)
			);
			chain = run.then(
				() => undefined,
				() => undefined
			);
			return run;
		},
		lastKnownQueueDepth: () => queueDepth,
		noteQueueDepth: (depth) => {
			queueDepth = depth;
		},
		lastError: () => lastError,
	};
}
