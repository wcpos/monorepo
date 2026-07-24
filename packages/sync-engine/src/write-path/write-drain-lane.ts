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
import type { Fetcher, StoreScopeManager, SyncObserver } from '@wcpos/sync-core';

import { type WriteAck, writeFacetFor } from '../collections/collection-descriptors';
import { queueFor, requeueBornTwiceSnapshot } from './write-intents';
import { orderDocumentFromWooPayload } from '../scheduler/rx-scheduler-order-fetcher';

import type { EngineSourceFetcher } from '../change-signal/change-signal-source';
import type { RxDatabase } from 'rxdb';

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
	const response = await input.fetch(
		`${input.syncBaseUrl}/orders?include=${input.wooOrderId}&per_page=1&orderby=include`
	);
	if (!response.ok) throw new Error(`revision refresh failed: HTTP ${response.status}`);
	const [payload] = (await response.json()) as Record<string, unknown>[];
	if (!payload) return null;
	return orderDocumentFromWooPayload(payload as never).sync.revision || null;
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
	| { type: 'write-rejected'; collection: string; recordId: string; mutationId: string };

export type WriteDrainReport = {
	lane: 'write-drain';
	status: 'ran' | 'skipped' | 'error';
	reason?: string;
	error?: string;
	pushed?: number;
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
				const wrote = await bound
					.guardWrite(async () => {
						const result = await drainMutationQueue({
							queue,
							signal: tickAbort.signal,
							currentRevision: async (mutation) => {
								const doc = await database.collections[mutation.collectionName]
									?.findOne(mutation.recordId)
									.exec();
								const row = doc?.toJSON() as { sync?: { revision?: string } } | undefined;
								return row?.sync?.revision;
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
							push: (mutation) =>
								pushRecordMutation({
									mutation,
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
								}),
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
									const ack: WriteAck = {
										mutation: {
											mutationId: mutation.mutationId,
											operation: mutation.operation,
											recordId: mutation.recordId,
										},
										recordId,
										remoteId,
										currentRevision: pushResult.currentRevision,
										document: pushResult.document ?? null,
									};
									await facet.reconcile(database, ack, signal);
									// BORN-TWICE honest reconcile (gate2 #516 item 1): a create the
									// server answered 200 (not 201) matched an EXISTING document —
									// the pushed payload was DISCARDED by the born-twice guard.
									// Acking clean would silently lose the edit; re-land it as a
									// follow-up update (see requeueBornTwiceSnapshot's docblock for
									// the outcome-code comparison design and the successor layering).
									if (mutation.operation === 'create' && pushResult.httpStatus === 200) {
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
							...(deps.now !== undefined ? { now: deps.now } : {}),
						});
						const stillPending = new Set((await queue.pending()).map((m) => m.mutationId));
						for (const ack of ackCandidates) {
							if (!stillPending.has(ack.mutationId)) {
								deps.emitWriteEvent(ack);
							}
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
						for (const dead of result.rejected) {
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
							});
						}
						queueDepth = stillPending.size;
						report = {
							lane: 'write-drain',
							status: 'ran',
							pushed: result.pushed,
							conflicts: result.conflicts.length,
							deferred: result.deferred,
							failed: result.failed,
							rejected: result.rejected.length,
						};
					})
					.finally(() => {
						bound.signal.removeEventListener('abort', abortTick);
						signal?.removeEventListener('abort', abortTick);
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
