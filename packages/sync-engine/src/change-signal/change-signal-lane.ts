/**
 * The change-signal lane (facade slice 3): one deterministic, scope-guarded
 * tick = detect (hybrid engine poll) → route (planReplicationActions) → apply
 * (the generated arms), with the cursor committed ONLY after every arm
 * succeeded (ADR 0005/0007 — persistState is the applier's last step).
 *
 * Per-scope engine registry (the playground perScopeEngineRegistry semantics,
 * package-internal): one hybrid engine per scope, created lazily on first tick
 * from the persisted state blob (malformed blob → null → cold start, never a
 * crash). Collection resets leave this shared cursor and cached engine intact;
 * later signals for wiped records use the normal targeted apply arms.
 *
 * Scope safety: each tick runs under `manager.runGuarded`; the engine's
 * long-lived source fetches through a REBINDABLE fetcher that the tick points
 * at its own scope-bound fetch before polling (ticks are serialized on a lane
 * chain, so the holder is never contended). The whole apply is wrapped in
 * `bound.guardWrite` — a switch/reset landing mid-tick drops every write and
 * the tick reports stale instead of bleeding into the new scope.
 */

import {
	applyReplicationActions,
	createHybridChangeSignalEngine,
	planReplicationActions,
} from '@wcpos/sync-core';
import type {
	ConfigFingerprintSnapshot,
	Fetcher,
	HybridChangeSignalEngine,
	StoreScopeManager,
	SyncObserver,
} from '@wcpos/sync-core';

import { buildReplicationHandlers } from './change-signal-handlers';
import {
	createLiveChangeSignalSource,
	type EngineSourceFetcher,
	SUPPORTED_HYBRID_COLLECTIONS,
} from './change-signal-source';
import { createConfigFingerprintLiveSource } from './config-fingerprint-source';
import { deserializeChangeSignalState, serializeChangeSignalState } from './change-signal-state';

import type { RxDatabase } from 'rxdb';
import type {
	BarcodeSelectorsReader,
	ScopeBarcodeSelectors,
} from '../materialization/barcode-selectors';
import type { SyncCollectionName } from '../collections/engine-collections';

/** The engine-owned kv key holding one scope's serialized engine state. */
export const CHANGE_SIGNAL_STATE_KEY = 'checkpoint:change-signal';

export type ChangeSignalReport = {
	lane: 'change-signal';
	/** 'ran' = a tick executed to persist; 'skipped' = gated before any work;
	 * 'error' = the tick started and failed — cursor untouched, self-heals next tick. */
	status: 'ran' | 'skipped' | 'error';
	reason?: string;
	error?: string;
	/** This tick's poll abandoned an excessive replay and re-baselined to head.
	 * The facade uses it to converge the existence/seed lanes NOW instead of
	 * waiting out their 5–17 min cadences (server-side creates and reset refills
	 * are exactly what the discarded backlog rows would have delivered). */
	rebaselined?: boolean;
};

export type ChangeSignalLaneDeps = {
	manager: StoreScopeManager;
	databaseFor: (scopeId: string) => RxDatabase | null;
	fetcher: EngineSourceFetcher;
	syncBaseUrl: string;
	/** Blob I/O through the slice-2 checkpoint seam (engine kv or the ports.checkpoints override). */
	readBlob: (scopeId: string, key: string) => Promise<string | null>;
	writeBlob: (scopeId: string, key: string, value: string) => Promise<void>;
	connectivity: () => 'online' | 'offline' | 'degraded';
	diagnostics: SyncObserver;
	emitEvent: (event: { type: 'config-changed'; collections: string[] }) => void;
	withCollectionActivity?: <T>(
		collection: SyncCollectionName,
		work: () => Promise<T>
	) => Promise<T>;
	pullBatchSize?: () => number | undefined;
	now?: () => number;
	/**
	 * The per-scope barcode carriers (materialization/barcode-selectors). The lane
	 * both WRITES them — every config-fingerprint poll republishes the resolved
	 * carriers onto the polled scope — and READS them, to materialize this tick's
	 * pulls and to ask whether the scope owes a hydration-miss recovery.
	 */
	barcodeSelectorsFor?: (scopeId: string) => ScopeBarcodeSelectors | null;
};

export type ChangeSignalLane = {
	/** One deterministic tick (serialized — concurrent calls queue). */
	tick(signal?: AbortSignal): Promise<ChangeSignalReport>;
	/** Explicitly evict one scope's cached engine without changing its persisted state. */
	prune(scopeId: string): void;
	lastError(): string | null;
};

export function createChangeSignalLane(deps: ChangeSignalLaneDeps): ChangeSignalLane {
	const engines = new Map<string, HybridChangeSignalEngine>();
	/** Rebindable per-tick fetch — see the module header. */
	let activeFetch: Fetcher | null = null;
	const sourceFetcher: EngineSourceFetcher = (url, init) => {
		if (!activeFetch) {
			return Promise.reject(new Error('change-signal source fetched outside a tick'));
		}
		return activeFetch(url, init);
	};
	let chain: Promise<unknown> = Promise.resolve();
	let lastError: string | null = null;

	/** Cold-start baseline: jump the cursor to the server's sequence head in ONE
	 * request (checkpoint.head) — a fresh scope must never drain the whole
	 * historical change-log; other lanes own bootstrap data. 0 when the field
	 * is absent (older server) — the engine then cold-starts at 0 (the fake
	 * servers in tests, and small labs, drain honestly). A failed head fetch
	 * throws: the tick reports error and the NEXT tick re-primes (lazy,
	 * retried — a transient startup failure never disables the loop). */
	async function fetchHeadSequence(): Promise<number> {
		const response = await sourceFetcher(
			`${deps.syncBaseUrl}/changes/sequence-log?collection=all&since=0&limit=1`
		);
		if (!response.ok) throw new Error(`change-signal head fetch failed: HTTP ${response.status}`);
		const body = (await response.json()) as { checkpoint?: { head?: number } };
		const head = body.checkpoint?.head;
		return typeof head === 'number' && Number.isFinite(head) ? head : 0;
	}

	async function engineFor(scopeId: string): Promise<HybridChangeSignalEngine> {
		const existing = engines.get(scopeId);
		if (existing) return existing;
		const blob = await deps.readBlob(scopeId, CHANGE_SIGNAL_STATE_KEY);
		const restored = blob === null ? null : deserializeChangeSignalState(blob);
		const initial = restored ?? {
			initialCursor: { sequence: await fetchHeadSequence() },
			baselineDigests: undefined,
		};
		const engine = createHybridChangeSignalEngine({
			source: createLiveChangeSignalSource({
				syncBaseUrl: deps.syncBaseUrl,
				fetcher: sourceFetcher,
				publishBarcodeSelectors: (collection, selectors) =>
					deps.barcodeSelectorsFor?.(scopeId)?.publish(collection, selectors),
			}),
			// ADR 0006 config tier: a settings change with no row change (e.g. a
			// barcode-field flip) must still surface staleCollections and re-derive.
			configSource: createConfigFingerprintLiveSource({
				syncBaseUrl: deps.syncBaseUrl,
				fetcher: sourceFetcher,
				publishBarcodeSelectors: (collection, selectors) =>
					deps.barcodeSelectorsFor?.(scopeId)?.publish(collection, selectors),
			}),
			initialCursor: initial.initialCursor,
			...(restored?.epoch !== undefined ? { initialEpoch: restored.epoch } : {}),
			...(initial.baselineDigests !== undefined
				? { baselineDigests: initial.baselineDigests }
				: {}),
			...(restored?.configBaseline !== undefined
				? { configBaseline: restored.configBaseline }
				: {}),
			...(deps.barcodeSelectorsFor
				? {
						forceConfigStaleCollections: (snapshot: ConfigFingerprintSnapshot) =>
							deps.barcodeSelectorsFor!(scopeId)?.staleCollectionsForRecovery(snapshot) ?? [],
					}
				: {}),
			...(deps.now !== undefined ? { now: deps.now } : {}),
		});
		engines.set(scopeId, engine);
		return engine;
	}

	async function runTick(signal?: AbortSignal): Promise<ChangeSignalReport> {
		let tickScopeId: string | null = null;
		if (signal?.aborted) {
			return { lane: 'change-signal', status: 'skipped', reason: 'aborted' };
		}
		if (deps.connectivity() === 'offline') {
			return { lane: 'change-signal', status: 'skipped', reason: 'offline' };
		}
		if (deps.manager.activeScope === null) {
			return {
				lane: 'change-signal',
				status: 'skipped',
				reason: 'no active scope',
			};
		}
		const cycleStartedAtMs = Date.now();
		let cycleSummary: { pulls: number; deletes: number } | null = null;
		let cursorSummary: {
			from?: number;
			to?: number;
			reported?: number;
			head?: number;
			rebaselined: boolean;
		} | null = null;
		let configChangedCollections: string[] = [];
		try {
			return await deps.manager.runGuarded(async (bound) => {
				const scopeId = bound.scopeId;
				tickScopeId = scopeId;
				const database = deps.databaseFor(scopeId);
				if (!database) {
					return {
						lane: 'change-signal' as const,
						status: 'skipped' as const,
						reason: 'scope database not open',
					};
				}
				// Bind BEFORE engineFor — a cold start's head-priming fetch rides this
				// tick's scope ticket too.
				const tickFetcher: Fetcher =
					signal === undefined
						? deps.fetcher
						: async (url, init) => {
								const scopeSignal = init?.signal;
								const combined = new AbortController();
								const abort = () => combined.abort();
								if (signal.aborted || scopeSignal?.aborted) {
									abort();
								} else {
									signal.addEventListener('abort', abort, { once: true });
									scopeSignal?.addEventListener('abort', abort, { once: true });
								}
								try {
									return await deps.fetcher(url, {
										...init,
										signal: combined.signal,
									});
								} finally {
									signal.removeEventListener('abort', abort);
									scopeSignal?.removeEventListener('abort', abort);
								}
							};
				activeFetch = bound.bindFetch(tickFetcher);
				const engine = await engineFor(scopeId);
				let report: ChangeSignalReport = {
					lane: 'change-signal',
					status: 'ran',
				};
				let rebaselined = false;
				const wrote = await bound.guardWrite(async () => {
					const outcome = await engine.poll();
					configChangedCollections =
						outcome.configChanges?.map((change) => change.collection) ?? [];
					const actions = planReplicationActions(outcome);
					rebaselined = actions.rebaselineCollections.length > 0;
					cycleSummary = {
						pulls: actions.targetedPulls.reduce((n, group) => n + group.ids.length, 0),
						deletes: actions.deletes.reduce((n, group) => n + group.ids.length, 0),
					};
					cursorSummary = {
						from: outcome.previousCursor?.sequence,
						to: outcome.cursor.sequence,
						reported: outcome.reportedCursor?.sequence,
						head: outcome.head,
						rebaselined: outcome.rebaseline,
					};
					// A LIVE reader, resolved at each projection: the config poll above
					// publishes this scope's carriers, and a long chunked apply must not
					// keep materializing by the carrier it started with.
					const barcodeSelectors: BarcodeSelectorsReader | undefined =
						deps.barcodeSelectorsFor === undefined
							? undefined
							: () => deps.barcodeSelectorsFor!(scopeId)?.current();
					await applyReplicationActions(
						actions,
						buildReplicationHandlers({
							database,
							fetch: activeFetch as Fetcher,
							syncBaseUrl: deps.syncBaseUrl,
							persistState: async (state) => {
								await deps.writeBlob(
									scopeId,
									CHANGE_SIGNAL_STATE_KEY,
									serializeChangeSignalState(state)
								);
								// THIS persist — the change-signal state of the tick that carried
								// the forced re-pull — is what spends a hydration-miss recovery.
								// It lives here, not on the shared blob seam: that seam is also
								// the customer trickle's cursor store, and a write from any other
								// lane must not retire a recovery this lane has not yet landed.
								deps.barcodeSelectorsFor?.(scopeId)?.noteRecoveryPersisted();
							},
							log: (line) =>
								deps.diagnostics({
									type: 'signal.log',
									level: 'debug',
									message: line,
								}),
							observe: deps.diagnostics,
							...(deps.withCollectionActivity !== undefined
								? { withCollectionActivity: deps.withCollectionActivity }
								: {}),
							...(deps.pullBatchSize !== undefined ? { pullBatchSize: deps.pullBatchSize } : {}),
							...(barcodeSelectors !== undefined ? { barcodeSelectors } : {}),
						})
					);
				});
				if (wrote === 'dropped') {
					report = {
						lane: 'change-signal',
						status: 'skipped',
						reason: 'scope moved mid-tick (writes dropped)',
					};
				} else if (rebaselined) {
					report = { ...report, rebaselined: true };
				}
				if (wrote !== 'dropped' && configChangedCollections.length > 0) {
					deps.emitEvent({
						type: 'config-changed',
						collections: configChangedCollections,
					});
				}
				if (wrote !== 'dropped' && cycleSummary !== null && cursorSummary !== null) {
					deps.diagnostics({
						type: 'signal.cycle',
						level: 'info',
						message: `change-signal: checked for updates (${cycleSummary.pulls} changed, ${cycleSummary.deletes} deleted)`,
						fields: {
							collectionsChecked: [...SUPPORTED_HYBRID_COLLECTIONS],
							pulls: cycleSummary.pulls,
							deletes: cycleSummary.deletes,
							durationMs: Date.now() - cycleStartedAtMs,
							...(cursorSummary.to !== undefined ? { cursor: cursorSummary.to } : {}),
							...(cursorSummary.from !== undefined ? { cursorFrom: cursorSummary.from } : {}),
							...(cursorSummary.head !== undefined ? { head: cursorSummary.head } : {}),
							...(cursorSummary.head !== undefined && cursorSummary.to !== undefined
								? {
										backlog: Math.max(0, cursorSummary.head - cursorSummary.to),
									}
								: {}),
						},
					});
					const { from, head } = cursorSummary;
					const committedTo = cursorSummary.to;
					const to =
						!cursorSummary.rebaselined &&
						from !== undefined &&
						cursorSummary.reported !== undefined &&
						cursorSummary.reported < from
							? cursorSummary.reported
							: committedTo;
					let reason: 'behind-head' | 'backwards' | null = null;
					if (cursorSummary.rebaselined) {
						reason = 'behind-head';
					} else if (from !== undefined && to !== undefined && to < from) {
						reason = 'backwards';
					}
					if (reason !== null && to !== undefined) {
						// `backlog` carries ONE meaning everywhere it appears — how far the
						// cursor still sits behind the server head — so it stays comparable
						// between this row and the signal.cycle row for the same poll. The
						// number of changes a behind-head jump skipped OVER is a different
						// quantity and gets its own name; reporting it as `backlog` would
						// have the two rows of one cycle disagree under the same key
						// (a jump lands AT head, so its backlog is 0 while its skip is large).
						const backlog =
							head === undefined || committedTo === undefined
								? undefined
								: Math.max(0, head - committedTo);
						const skipped =
							reason === 'behind-head' && head !== undefined && from !== undefined
								? Math.max(0, head - from)
								: undefined;
						const message =
							reason === 'behind-head'
								? skipped === undefined
									? 'change-signal: cursor jumped to head'
									: `change-signal: cursor jumped to head (skipped ${skipped} changes)`
								: `change-signal: cursor moved backwards (${from} → ${to})`;
						deps.diagnostics({
							type: 'signal.cursor',
							level: 'warn',
							message,
							fields: {
								reason,
								from,
								to,
								...(head !== undefined ? { head } : {}),
								...(backlog !== undefined ? { backlog } : {}),
								...(skipped !== undefined ? { skipped } : {}),
							},
						});
					}
				}
				lastError = null;
				return report;
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			lastError = message;
			// Drop the scope's CACHED engine: engine.poll() commits its in-memory
			// cursor on a shape-valid page, so a failure AFTER the poll (a pull 500,
			// a bulkUpsert error) would otherwise leave the retained cursor past
			// changes that were never applied — the retry tick would silently skip
			// them. Pruning makes the next tick restore from the last PERSISTED
			// blob (commit-only-after-all-arms), re-detecting the failed page.
			if (tickScopeId !== null) {
				engines.delete(tickScopeId);
			}
			if (signal?.aborted || (tickScopeId !== null && deps.manager.activeScope !== tickScopeId)) {
				lastError = null;
				return { lane: 'change-signal', status: 'skipped', reason: 'aborted' };
			}
			deps.diagnostics({ type: 'signal.tick.error', level: 'error', message });
			return { lane: 'change-signal', status: 'error', error: message };
		} finally {
			activeFetch = null;
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
		prune: (scopeId) => {
			engines.delete(scopeId);
		},
		lastError: () => lastError,
	};
}
