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
 */
export type ConflictResolutionChoice = 'retry-with-server-base' | 'requeue-rebuilt' | 'discard';

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
		resolveConflict: async (mutationId: string, resolution: ConflictResolutionChoice) => {
			assertNotDisposed();
			await readySettledForSync;
			// Scope-guarded like write(): the resolution writes into the captured
			// scope's queue + record, and a switch/reset mid-resolution drops them.
			let needsRepull: number | null = null;
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
							const refreshedRevision = (serverDocument?.sync as { revision?: unknown } | undefined)
								?.revision;
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
						discardRemovesResident = discardServerDocument === null;
					} else if (entry.operation === 'create') {
						// A rejected born-local create has no remote identity because it
						// never existed server-side. Discard therefore means tombstone.
						discardRemovesResident = true;
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
							now: () => new Date(ports.now !== undefined ? ports.now() : Date.now()).toISOString(),
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
						const row = doc?.toJSON() as { wooOrderId?: number | null } | undefined;
						// #516 item 5: queue the server-truth re-pull DURABLY *before*
						// clearing local state. A persisted targeted scheduler task
						// survives crashes and failed fetches (a failed task re-runs once
						// its retry gate elapses), so discard can never strand the record
						// silently posing as synced with the re-pull lost in memory.
						if (entry.collectionName === 'orders' && typeof row?.wooOrderId === 'number') {
							needsRepull = row.wooOrderId;
							await seedTargetedOrderSchedulerTask({
								orderIds: [row.wooOrderId],
								priority: 1_000,
								completedDedupeForMs: 0,
								...(ports.now !== undefined ? { nowMs: ports.now() } : {}),
								database: database,
							});
						}
						if (entry.collectionName !== 'orders' && discardServerDocument) {
							const facet = writeFacetFor(entry.collectionName);
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
						if (discardRemovesResident && doc) await doc.remove();
						await queue.remove([mutationId]);
						if (doc && !discardRemovesResident) {
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
					fields: { recordId: settled.recordId, mutationId, resolution },
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
		},
	};
}
