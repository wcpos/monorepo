/**
 * The change-signal lane: one deterministic, scope-guarded
 * tick = detect (hybrid engine poll) → route (planReplicationActions) → apply
 * (the generated arms), with the cursor committed ONLY after every arm
 * succeeded (ADR 0005/0007 — persistState is the applier's last step).
 *
 * Per-scope engine registry (package-internal): one hybrid engine per scope, created lazily on first tick
 * from the persisted state blob. The cursor is primed at scope open; lazy first-tick
 * priming is the fallback for a failed or offline open (malformed blob → cold start).
 * Collection resets leave this shared cursor and cached engine intact;
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
	HybridCollection,
	ReplicationActions,
	ScopeBound,
	StoreScopeManager,
	SyncObserver,
} from '@wcpos/sync-core';

import { COLLECTION_DESCRIPTORS } from '../collections/collection-descriptors';
import { RxQueryTotalCacheRepository } from '../collections/rx-query-total-cache-repository';
import { censusQueryKey } from '../scheduler';
import { type EngineTimers, systemTimers } from '../engine-timers';
import { buildReplicationHandlers } from './change-signal-handlers';
import {
	ChangeSignalPoisonError,
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
import type { QueryTotalCacheEvent } from '../maintenance/maintenance-lanes';
import type { QueryTotalCacheEntry } from '../scheduler';

/** Detection vocabulary → engine collection names (local-only rows carry no hybrid). */
const COLLECTION_FOR_HYBRID: ReadonlyMap<HybridCollection, SyncCollectionName> = new Map(
	COLLECTION_DESCRIPTORS.flatMap((descriptor) =>
		'hybrid' in descriptor ? [[descriptor.hybrid, descriptor.collection] as const] : []
	)
);

/**
 * The collections whose SERVER population this tick's applied plan changed —
 * their census totals are about to be wrong, so the tick expires them for the
 * query-total lane to re-probe. Pulls/deletes with no ids are detection noise,
 * not a population change.
 */
export function censusCollectionsForActions(actions: ReplicationActions): SyncCollectionName[] {
	const hybrids = new Set<HybridCollection>([
		...actions.targetedPulls.filter((group) => group.ids.length > 0).map((g) => g.collection),
		...actions.deletes.filter((group) => group.ids.length > 0).map((g) => g.collection),
		...actions.rebaselineCollections,
		...actions.reFetchCollections,
	]);
	return [...hybrids].flatMap((hybrid) => {
		const collection = COLLECTION_FOR_HYBRID.get(hybrid);
		return collection === undefined ? [] : [collection];
	});
}

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
	awaitInitialReady: () => Promise<void>;
	needsPrime: (scopeId: string) => boolean;
	timers?: EngineTimers;
	manager: StoreScopeManager;
	databaseFor: (scopeId: string) => RxDatabase | null;
	fetcher: EngineSourceFetcher;
	syncBaseUrl: string;
	/** Blob I/O through the scope checkpoint seam (engine kv or the ports.checkpoints override). */
	readBlob: (scopeId: string, key: string) => Promise<string | null>;
	writeBlob: (scopeId: string, key: string, value: string) => Promise<void>;
	connectivity: () => 'online' | 'offline' | 'degraded';
	diagnostics: SyncObserver;
	emitEvent: (
		event: { type: 'config-changed'; collections: string[] } | QueryTotalCacheEvent
	) => void;
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
	/** Completes scope activation, not synchronization. */
	activated(scopeId: string): Promise<void>;
	admitted(): Promise<ScopeBound>;
	stopActivation(): void;
	/** One deterministic tick (serialized — concurrent calls queue). */
	tick(signal?: AbortSignal): Promise<ChangeSignalReport>;
	/** Explicitly evict one scope's cached engine without changing its persisted state. */
	prune(scopeId: string): void;
	lastError(): string | null;
};

export function createChangeSignalLane(deps: ChangeSignalLaneDeps): ChangeSignalLane {
	const engines = new Map<string, HybridChangeSignalEngine>();
	/** The head THIS instance primed a scope at (scope open). Two tabs opening
	 * one fresh scope can both read "no state" and the later, higher head can
	 * land in the blob after ours; restoring that would skip everything this tab
	 * fetched in between. A lower cursor is always safe (re-delivery is
	 * idempotent), so every engine this instance builds starts from the lower of
	 * the two until one of ITS ticks commits (persistState) — a tick that fails
	 * after its poll is pruned and rebuilt, and must find the floor still here. */
	const primedAtOpen = new Map<string, { head: number; epoch?: string }>();
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
	let activation = new Promise<void>(() => undefined);
	let activationAbort: AbortController | null = null;
	let activationStopped = false;
	const timers = deps.timers ?? systemTimers;

	/** Cold-start baseline: jump the cursor to the server's sequence head in ONE
	 * request (checkpoint.head) — a fresh scope must never drain the whole
	 * historical change-log; other lanes own bootstrap data. 0 when the field
	 * is absent (older server) — the engine then cold-starts at 0 (the fake
	 * servers in tests, and small labs, drain honestly). A failed head fetch
	 * throws: the tick reports error and the NEXT tick re-primes (lazy,
	 * retried — a transient startup failure never disables the loop). */
	async function fetchHeadCheckpoint(fetch: Fetcher): Promise<{ head: number; epoch?: string }> {
		const response = await fetch(
			`${deps.syncBaseUrl}/changes/sequence-log?collection=all&since=0&limit=1`
		);
		if (!response.ok) {
			throw new ChangeSignalPoisonError(
				`change-signal head fetch failed: HTTP ${response.status}`,
				'/changes/sequence-log',
				response.status
			);
		}
		const body = (await response.json()) as { checkpoint?: { head?: number; epoch?: string } };
		const head = body.checkpoint?.head;
		// The epoch travels WITH the primed head: a cursor adopted from this
		// checkpoint provably addresses this generation, and an engine that could
		// not name the generation would treat its own primed cursor as unproven
		// and rebaseline the whole catalogue on the very first poll.
		const epoch = body.checkpoint?.epoch;
		return {
			head: typeof head === 'number' && Number.isFinite(head) ? head : 0,
			...(typeof epoch === 'string' && epoch !== '' ? { epoch } : {}),
		};
	}

	async function engineFor(scopeId: string): Promise<HybridChangeSignalEngine> {
		const existing = engines.get(scopeId);
		if (existing) return existing;
		const blob = await deps.readBlob(scopeId, CHANGE_SIGNAL_STATE_KEY);
		const restored = blob === null ? null : deserializeChangeSignalState(blob);
		const primed = restored === null ? await fetchHeadCheckpoint(sourceFetcher) : null;
		const initial = restored ?? {
			initialCursor: { sequence: primed?.head ?? 0 },
			baselineDigests: undefined,
		};
		const initialEpoch = restored?.epoch ?? primed?.epoch;
		const ownPrime = primedAtOpen.get(scopeId);
		if (
			ownPrime !== undefined &&
			restored !== null &&
			ownPrime.epoch === restored.epoch &&
			ownPrime.head < restored.initialCursor.sequence
		) {
			initial.initialCursor = { sequence: ownPrime.head };
		}
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
			...(initialEpoch !== undefined ? { initialEpoch } : {}),
			...(initial.baselineDigests !== undefined
				? { baselineDigests: initial.baselineDigests }
				: {}),
			...(restored?.escalations !== undefined ? { initialEscalations: restored.escalations } : {}),
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

	function fetcherWithSignal(signal?: AbortSignal): Fetcher {
		if (!signal) return deps.fetcher;
		return async (url, init) => {
			const signals = [signal, init?.signal];
			const combined = new AbortController();
			const abort = () => combined.abort();
			if (signals.some((s) => s?.aborted)) abort();
			else signals.forEach((s) => s?.addEventListener('abort', abort, { once: true }));
			try {
				return await deps.fetcher(url, { ...init, signal: combined.signal });
			} finally {
				signals.forEach((s) => s?.removeEventListener('abort', abort));
			}
		};
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
		let expiredCensusEntries: QueryTotalCacheEntry[] = [];
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
				activeFetch = bound.bindFetch(fetcherWithSignal(signal));
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
					const applyResult = await applyReplicationActions(
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
								// This instance's cursor is now the persisted truth; the
								// scope-open floor has done its job.
								primedAtOpen.delete(scopeId);
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
					// The applied plan just changed these collections' local mirror of the
					// server population, so their census totals are stale the moment this
					// tick lands — expire them and the query-total lane re-probes on its
					// next scan instead of waiting out the freshness window (device count
					// racing a frozen server total on the health page, 2026-08-19).
					// Best-effort by design: a failed expiry must not fail the tick or
					// force a replay — the freshness TTL stays the backstop.
					try {
						const changedCollections = censusCollectionsForActions(actions);
						for (const result of applyResult.reDerived) {
							if (result.rederived) continue;
							const collection = COLLECTION_FOR_HYBRID.get(result.collection);
							if (collection !== undefined && !changedCollections.includes(collection)) {
								changedCollections.push(collection);
							}
						}
						if (changedCollections.length > 0) {
							const cacheRepository = new RxQueryTotalCacheRepository(database as never);
							const expiry = await cacheRepository.expire(
								changedCollections.map(censusQueryKey),
								deps.now?.() ?? Date.now()
							);
							expiredCensusEntries = expiry.expired;
							for (const failure of expiry.failures) {
								deps.diagnostics({
									type: 'signal.log',
									level: 'warn',
									message: `census expiry after change-signal apply failed for ${failure.queryKey}: ${failure.error instanceof Error ? failure.error.message : String(failure.error)}`,
								});
							}
						}
					} catch (error) {
						deps.diagnostics({
							type: 'signal.log',
							level: 'warn',
							message: `census expiry after change-signal apply failed: ${error instanceof Error ? error.message : String(error)}`,
						});
					}
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
				if (wrote !== 'dropped' && expiredCensusEntries.length > 0) {
					// Same event the query-total lane emits for fresh totals — the facade
					// republishes the census so subscribers see the entries go stale now,
					// not at their old expiry timers.
					deps.emitEvent({ type: 'query-total-cache', entries: expiredCensusEntries });
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
			const status = error instanceof ChangeSignalPoisonError ? error.status : undefined;
			deps.diagnostics({
				type: 'signal.tick.error',
				level: 'error',
				message,
				fields: { lane: 'change-signal', ...(status !== undefined ? { status } : {}) },
			});
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
		admitted: async () => {
			await deps.awaitInitialReady();
			for (let attempt = 0; ; attempt++) {
				if (attempt > 0) {
					deps.diagnostics({
						type: 'signal.log',
						level: 'debug',
						message: 'activation superseded while admitting; waiting for the new one',
					});
				}
				const current = activation;
				await current;
				if (current === activation) return deps.manager.runGuarded(async (bound) => bound);
			}
		},
		stopActivation: () => {
			activationStopped = true;
			activationAbort?.abort();
		},
		activated: (scopeId) => {
			const controller = (activationAbort = new AbortController());
			const signal = controller.signal;
			let onAbort!: () => void;
			const aborted = new Promise<null>((resolve) => {
				onAbort = () => resolve(null);
				signal.addEventListener('abort', onAbort, { once: true });
			});
			if (activationStopped) controller.abort();
			let resolveSwitch!: () => void;
			let rejectSwitch!: (error: unknown) => void;
			const switched = new Promise<void>((resolve, reject) => {
				resolveSwitch = resolve;
				rejectSwitch = reject;
			});
			// Flips once the blob write has begun: from then on the chain waits for
			// the prime (see below), abort or not.
			let writing = false;
			const run = async () => {
				await switched;
				if (!deps.needsPrime(scopeId)) return null;
				if (signal.aborted) return null;
				if (deps.connectivity() === 'offline') return null;
				if (deps.manager.activeScope === null) return null;
				let primeScopeId: string | null = null;
				try {
					return await deps.manager.runGuarded(async (bound) => {
						const scopeId = bound.scopeId;
						primeScopeId = scopeId;
						if (engines.has(scopeId)) return null;
						const blob = await deps.readBlob(scopeId, CHANGE_SIGNAL_STATE_KEY);
						const restored = blob === null ? null : deserializeChangeSignalState(blob);
						if (restored) return null;
						// The activation deadline may pass while a port that ignores its signal
						// is still answering. Once the caller has moved on to the bootstrap
						// pulls, a late head would sit ABOVE their changes — exactly the gap
						// this prime closes — so check after every await and write nothing
						// once aborted.
						if (signal.aborted || !bound.isCurrent()) return null;
						// Its own bound fetcher, never the tick's rebindable one: the prime
						// shares no state with a tick, so a hung prime can be released from
						// the chain below without a later tick losing its fetch.
						const { head, epoch } = await fetchHeadCheckpoint(
							bound.bindFetch(fetcherWithSignal(signal))
						);
						if (signal.aborted || !bound.isCurrent()) return null;
						// Another instance (a second tab on the same fresh scope) may have
						// primed while our head fetch was in flight. Its head is never above
						// a change it has yet to fetch, and ours may be — so the first VALID
						// checkpoint observed on the re-read wins (not an atomic first-writer
						// guarantee). The write itself is a guarded scope write:
						// a switch or dispose landing meanwhile drops it instead of letting a
						// slow checkpoint port overwrite a successor's state.
						const raced = await deps.readBlob(scopeId, CHANGE_SIGNAL_STATE_KEY);
						// The re-read is the last await before the write: an abort that landed
						// during it already released the chain, so a tick may have persisted —
						// neither a write NOR a floor from this stale head may follow.
						if (signal.aborted || !bound.isCurrent()) return null;
						const racedState = raced === null ? null : deserializeChangeSignalState(raced);
						if (racedState) {
							primedAtOpen.set(scopeId, { head, ...(epoch ? { epoch } : {}) });
							return null;
						}
						writing = true;
						const wrote = await bound.guardWrite(() =>
							deps.writeBlob(
								scopeId,
								CHANGE_SIGNAL_STATE_KEY,
								serializeChangeSignalState({
									cursor: { sequence: head },
									baselineDigests: new Map(),
									escalations: [],
									...(epoch ? { epoch } : {}),
								})
							)
						);
						if (wrote === 'dropped') return null;
						primedAtOpen.set(scopeId, { head, ...(epoch ? { epoch } : {}) });
						if (signal.aborted) return null;
						deps.diagnostics({
							type: 'signal.log',
							level: 'debug',
							message: `change-signal: primed cursor at head ${head} at scope open`,
						});
						return { head, ...(epoch ? { epoch } : {}) };
					});
				} catch (error) {
					// A switch or reset landing mid-prime makes the bound fetch reject with
					// a stale ticket — the same shape a tick reports as 'skipped', not an
					// error worth a warning at the facade.
					if (primeScopeId !== null && deps.manager.activeScope !== primeScopeId) {
						return null;
					}
					throw error;
				}
			};
			const predecessor = chain.then(
				() => undefined,
				() => undefined
			);
			const queued = chain.then(run, run);
			// A checkpoint or fetch port that never settles must not wedge the lane
			// behind this prime: once the caller's deadline aborts, the chain moves
			// on and later ticks run. Safe while the prime is still READING or
			// FETCHING — it holds no shared state (own bound fetcher) and writes
			// nothing once aborted. Once its blob write has begun the chain waits
			// for it regardless: a late write landing after a tick's persist would
			// replace that tick's cursor, baselines and ledger with the empty prime.
			// Only the prime's OWN run is skipped: the chain still waits for whatever
			// was queued before it, so an abort during an in-flight tick never lets
			// the next tick overlap that one.
			const ownRunOrAborted = Promise.race([queued, aborted.then(() => (writing ? queued : null))]);
			chain = predecessor
				.then(() => ownRunOrAborted)
				.then(
					() => undefined,
					() => undefined
				);
			// Reserve admission AND chain position before switchTo can publish the database.
			let release!: () => void;
			activation = new Promise<void>((resolve) => {
				release = resolve;
			});
			return (async () => {
				try {
					try {
						void deps.manager.switchTo(scopeId).then(resolveSwitch, rejectSwitch);
					} catch (error) {
						rejectSwitch(error);
					}
					await switched;
					const timeout = timers.setTimeout(() => controller.abort(), 5_000);
					try {
						await Promise.race([queued, aborted]);
						if (signal.aborted) throw new Error('change-signal prime aborted');
					} catch (error) {
						deps.diagnostics({
							type: 'signal.log',
							level: 'warn',
							message: `change-signal: prime at scope open failed — the first tick primes lazily: ${error instanceof Error ? error.message : String(error)}`,
							fields: { scopeId },
						});
					} finally {
						timers.clearTimeout(timeout);
					}
				} finally {
					signal.removeEventListener('abort', onAbort);
					if (activationAbort === controller) activationAbort = null;
					release();
				}
			})();
		},
		prune: (scopeId) => {
			engines.delete(scopeId);
		},
		lastError: () => lastError,
	};
}
