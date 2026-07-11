/**
 * The change-signal lane (facade slice 3): one deterministic, scope-guarded
 * tick = detect (hybrid engine poll) → route (planReplicationActions) → apply
 * (the generated arms), with the cursor committed ONLY after every arm
 * succeeded (ADR 0005/0007 — persistState is the applier's last step).
 *
 * Per-scope engine registry (the playground perScopeEngineRegistry semantics,
 * package-internal): one hybrid engine per scope, created lazily on first tick
 * from the persisted state blob (malformed blob → null → cold start, never a
 * crash), pruned on collection reset — the facade registers `prune` +
 * blob-clear as cursor invalidators, so the manager runs them INSIDE the
 * serialized reset and a stale cursor over an emptied replica is
 * unrepresentable (ADR 0018 invariant 2).
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
	Fetcher,
	HybridChangeSignalEngine,
	StoreScopeManager,
	SyncObserver,
} from '@wcpos/sync-core';

import { buildReplicationHandlers } from './change-signal-handlers';
import { createLiveChangeSignalSource, type EngineSourceFetcher } from './change-signal-source';
import { createConfigFingerprintLiveSource } from './config-fingerprint-source';
import { deserializeChangeSignalState, serializeChangeSignalState } from './change-signal-state';

import type { RxDatabase } from 'rxdb';

/** The engine-owned kv key holding one scope's serialized engine state. */
export const CHANGE_SIGNAL_STATE_KEY = 'checkpoint:change-signal';

/**
 * The blob a collection RESET writes: cursor REWOUND TO ZERO with empty
 * baselines — NOT deleted. A deleted blob would make the next tick treat the
 * scope as brand new and prime to head, silently skipping the historical
 * sequence-log rows needed to REFILL the just-dropped collection; a zero
 * cursor drains them (the same rewind-to-zero contract the web host's reset
 * wiring keeps).
 */
export function zeroChangeSignalStateBlob(): string {
	return serializeChangeSignalState({ cursor: { sequence: 0 }, baselineDigests: new Map() });
}

export type ChangeSignalReport = {
	lane: 'change-signal';
	/** 'ran' = a tick executed to persist; 'skipped' = gated before any work;
	 * 'error' = the tick started and failed — cursor untouched, self-heals next tick. */
	status: 'ran' | 'skipped' | 'error';
	reason?: string;
	error?: string;
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
	now?: () => number;
};

export type ChangeSignalLane = {
	/** One deterministic tick (serialized — concurrent calls queue). */
	tick(signal?: AbortSignal): Promise<ChangeSignalReport>;
	/** Drop a scope's in-memory engine (cursor invalidator half; blob clearing is the caller's). */
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
			}),
			// ADR 0006 config tier: a settings change with no row change (e.g. a
			// barcode-field flip) must still surface staleCollections and re-derive.
			configSource: createConfigFingerprintLiveSource({
				syncBaseUrl: deps.syncBaseUrl,
				fetcher: sourceFetcher,
			}),
			initialCursor: initial.initialCursor,
			...(initial.baselineDigests !== undefined
				? { baselineDigests: initial.baselineDigests }
				: {}),
			...(restored?.configBaseline !== undefined
				? { configBaseline: restored.configBaseline }
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
			return { lane: 'change-signal', status: 'skipped', reason: 'no active scope' };
		}
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
									return await deps.fetcher(url, { ...init, signal: combined.signal });
								} finally {
									signal.removeEventListener('abort', abort);
									scopeSignal?.removeEventListener('abort', abort);
								}
							};
				activeFetch = bound.bindFetch(tickFetcher);
				const engine = await engineFor(scopeId);
				let report: ChangeSignalReport = { lane: 'change-signal', status: 'ran' };
				const wrote = await bound.guardWrite(async () => {
					const outcome = await engine.poll();
					const actions = planReplicationActions(outcome);
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
							},
							log: (line) =>
								deps.diagnostics({ type: 'signal.log', level: 'debug', message: line }),
							observe: deps.diagnostics,
						})
					);
				});
				if (wrote === 'dropped') {
					report = {
						lane: 'change-signal',
						status: 'skipped',
						reason: 'scope moved mid-tick (writes dropped)',
					};
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
