import {
	addRxPlugin,
	createRxDatabase,
	type HashFunction,
	type RxDatabase,
	type RxStorage,
} from 'rxdb';
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema';

/**
 * `createRxdbSyncEngine` — the ONE deep facade hosts use the engine through
 * (ADR 0018). The handle owns scope lifecycle, every replication lane,
 * durable writes, requirements, and telemetry. `ready` means the initial
 * database is usable; a failed POS bootstrap seed is deliberately degraded
 * rather than fatal and is exposed by `status().bootstrapFailed`,
 * `status().gatedBy`, diagnostics, and `events()`.
 *
 * A scope's write plane has exactly one engine owner. This is a hard engine
 * contract: hosts that can mount multiple instances must leader-elect before
 * allowing `write()` or arming write/drain lanes. The engine's transact chain
 * is intentionally process-local; cross-instance election belongs to the
 * host boundary in apps/main, using the coordination primitive for each platform.
 *
 * Invariants carried here:
 *  1. Scope safety is unrepresentable — no ticket, epoch, or guarded-write
 *     type appears in this interface; capture lives behind the sync-core
 *     StoreScopeManager. Dropped work surfaces only as `guard` events +
 *     `status()` counters.
 *  2. Plain store switching preserves every scope's data, cursors, and
 *     mutation queue (pause/resume — the outgoing database stays open, and
 *     works offline). `resetCollection` clears per-collection checkpoint/trickle,
 *     existence-manifest, and scheduler/coverage state; the shared change-signal
 *     cursor is deliberately untouched.
 *     Resetting `'mutations'` with pending mutations returns 'needs-confirmation'
 *     and touches nothing without `confirmDestroyQueue`.
 *  3. Lifecycle ops serialize (the manager's promise-chain mutex); `dispose()`
 *     is terminal — further lifecycle calls reject.
 *  4. One engine instance owns a scope's write plane; multi-instance hosts
 *     must elect that owner before exposing writes or arming drains.
 *  5. Decisions the caller must make are values ('needs-confirmation');
 *     caller misuse is an exception (post-dispose call, unknown collection,
 *     cross-site identity — multi-site is a new engine).
 */

import {
	assertBulkSuccess,
	canonicalSiteKey,
	mintRemoteId,
	MUTATION_QUEUE_COLLECTION,
	normalizeCheckpoint,
	scopeDatabaseName,
	scopeKeyFor,
	StoreScopeManager,
	webCryptoUuid,
} from '@wcpos/sync-core';
import type {
	QueuedMutation,
	ScopeDatabase,
	ScopeEvent,
	StoreScopeIdentity,
	SyncObserver,
} from '@wcpos/sync-core';

import {
	ENGINE_KV_COLLECTION,
	engineCollectionCreators,
	isResettableCollection,
	MUTATION_QUEUE_RXDB_COLLECTION,
	resetEngineCollection,
	type ResettableCollectionName,
	SYNC_COLLECTION_NAMES,
	type SyncCollectionName,
} from './collections/engine-collections';
import {
	CHANGE_SIGNAL_STATE_KEY,
	createChangeSignalLane,
} from './change-signal/change-signal-lane';
import {
	createServerPressureMonitor,
	parseServerLoad1m,
	parseServerPressure,
	type ServerPressure,
} from './change-signal/server-pressure';
import { hydrateBarcodeSelectors } from './change-signal/config-fingerprint-source';
import {
	type BarcodeSelectors,
	createScopeBarcodeSelectors,
	type ScopeBarcodeSelectors,
} from './materialization/barcode-selectors';
import {
	createRequirePlane,
	type EngineRequirement,
	type RequirementHandle,
} from './require-plane';
import {
	type CensusTotals,
	ORDER_SCHEDULER_COVERAGE_FRESH_FOR_MS,
	seedPosBootstrapLanes,
	seedTargetedOrderSchedulerTask,
} from './scheduler';
import {
	COVERAGE_COMPACTION_RETAIN_STALE_FOR_MS,
	createMaintenanceLanes,
	type QueryTotalCacheEvent,
	type QueryTotalPort,
} from './maintenance/maintenance-lanes';
import {
	CUSTOMER_TRICKLE_STATE_KEY,
	decodeCustomerTrickleState,
} from './maintenance/customer-trickle';
import { PRODUCT_TRICKLE_STATE_KEY } from './maintenance/product-trickle';
import { VARIATION_PREFETCH_STATE_KEY } from './maintenance/variation-prefetch';
import { createLocalCoverage, type LocalCoverage } from './local-coverage/local-coverage';
import { withLedgerRecovery } from './local-coverage/ledger-storage-recovery';
import { createCoverageChangeHub } from './local-coverage/coverage-changes';
import { createReconcilePorts, removeTargeted } from './local-coverage/reconcile-port';
import {
	type ConflictResolutionChoice,
	createWritePlane,
	type WriteIntent,
} from './write-path/write-plane';
import { EngineOrderRepository } from './write-path/engine-order-repository';
import { armReadinessWatchdog } from './readiness-watchdog';
import { createCensusPublisher } from './census-publisher';
import { createAutomaticTickGate } from './automatic-tick-gate';
import { type CadenceController, createCadenceController } from './cadence-controller';
import { CHANGE_SIGNAL_STATE_ID } from './change-signal/change-signal-state-schema';
import { RxQueryTotalCacheRepository } from './collections/rx-query-total-cache-repository';
import {
	DEFAULT_LANE_INTERVALS,
	type EngineLaneName,
	LANE_REGISTRY,
	type LaneIntervalKey,
	laneRegistryEntry,
	type LaneTargetKey,
	MANUAL_SYNC_LANES,
	REBASELINE_RETICK_LANES,
	SEED_RETICK_LANES,
} from './maintenance/lane-registry';
import { type EngineTimers, systemTimers } from './engine-timers';

import type { WriteOutcomeBridge } from './write-path/write-outcome-bridge';
import type { CoverageTarget, CoverageVerdict } from './local-coverage/coverage-verdicts';
import type { MoneyDivergenceField, MoneyPrecisionMode } from './write-path/order-money-divergence';

const AUTO_REVERT_COLLECTIONS: ReadonlySet<string> = new Set([
	'products',
	'variations',
	'customers',
	'coupons',
] satisfies SyncCollectionName[]);

export type {
	CoverageOutcome,
	CustomerBrowseDimensions,
	EngineRequirement,
	OrderBrowseDimensions,
	ProductBrowseDimensions,
	RequirementHandle,
} from './require-plane';
export type {
	MaintenanceLaneName,
	MaintenanceLaneReport,
	QueryTotalPort,
	QueryTotalCacheEvent,
} from './maintenance/maintenance-lanes';
export type { ConflictResolutionChoice, WriteIntent } from './write-path/write-plane';
export type { CensusTotal, CensusTotals } from './scheduler';

export type EngineLane = EngineLaneName;

/** One deterministic tick's outcome. A full sync() (no lane) runs the ten
 * foreground/manual lanes in dependency order; the idle-only customer trickle
 * is registered but deliberately excluded. */
export type SyncReport = {
	lane: EngineLane | 'all';
	status: 'ran' | 'skipped' | 'error';
	reason?: string;
	error?: string;
	pushed?: number;
	held?: number;
	conflicts?: number;
	deferred?: number;
	failed?: number;
	rejected?: number;
	rebaselined?: boolean;
};

export type CollectionCheckReport = {
	collection: SyncCollectionName;
	status: 'ran' | 'skipped' | 'error';
	reason?: string;
	error?: string;
};

// Versioned sync schemas need the migration
// plugin at collection-create time. Idempotent — RxDB skips re-adds.
addRxPlugin(RxDBMigrationSchemaPlugin);

export type {
	SyncCollectionName,
	ResettableCollectionName,
} from './collections/engine-collections';
export type { StoreScopeIdentity } from '@wcpos/sync-core';

/** ADR 0017's engine-owned three-state reachability gate. */
export type EngineConnectivity = 'online' | 'offline' | 'degraded';

export type EngineCollectionState = {
	active: boolean;
	coverageGeneration: number;
};
/** RAW transport, never pre-scoped — the engine binds scope tickets inside. */
export type EngineFetcher = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Read-only reflection of the transport the host configured on the engine.
 * This does not add a transport or change engine behavior; it lets host-adjacent
 * consumers reuse the exact authenticated fetcher and sync namespace already in use.
 *
 * `fetcher` is the engine's own thin wrapper around the configured one — same
 * arguments, same response, same errors — so that a host-adjacent request to the
 * SAME server also feeds the server-pressure monitor (#846). Nothing about the
 * caller's request is delayed or retried by it.
 */
export type EngineHostTransport = Readonly<{
	syncBaseUrl: string;
	fetcher: EngineFetcher;
}>;

/** Host-provided checkpoint persistence. Async-first so a collection-backed
 * store fits; a synchronous store (localStorage) wraps trivially. */
export type EngineStringStore = {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
	remove(key: string): Promise<void>;
};

export type RxdbSyncEnginePorts = {
	site: { syncBaseUrl: string; wpJsonRoot: string };
	/** Optional host lifecycle barrier. Initial database creation waits for this
	 * while the engine handle itself remains synchronously constructible. */
	databaseOpenBarrier?: Promise<void>;
	/** The ONLY required adapter port. A factory receives the full scope
	 * identity so per-scope storage decisions stay possible. */
	storage:
		RxStorage<unknown, unknown> | ((identity: StoreScopeIdentity) => RxStorage<unknown, unknown>);
	/** Default: globalThis.fetch. Used by change-signal, scheduler, maintenance,
	 * conflict-resolution, and write-drain transport paths. */
	fetcher?: EngineFetcher;
	/** Default: the engine-owned kv collection INSIDE each scope db — a
	 * volatile database gets a volatile cursor for free. */
	checkpoints?: EngineStringStore;
	connectivity?: () => EngineConnectivity;
	/** Default: Web Crypto. Native hosts inject their UUID v4 generator. */
	uuid?: () => string;
	/** Default: Math.random. Injectable jitter source for deterministic tests. */
	random?: () => number;
	/** THE telemetry port (ADR 0020): structured SyncEvents, observed and never
	 * awaited; a throwing observer is swallowed. */
	diagnostics?: SyncObserver;
	/** 'auto' (default): all periodic lanes arm after `ready`. 'manual': no
	 * timers — callers drive deterministic ticks via sync(). */
	mode?: 'auto' | 'manual';
	/** RxDB multiInstance for the engine's scope databases (cross-instance change
	 * propagation via BroadcastChannel). Default false; apps/main selects the
	 * value for its current platform. */
	multiInstance?: boolean;
	/** Web multi-tab: true only while this engine owns the write plane. Followers
	 * still read, but do not drain or mutate existing queue rows. Default true. */
	writePlaneOwner?: () => boolean;
	/**
	 * Web multi-tab: the cross-tab write-outcome bridge (#1209). Since #1057 only
	 * the leader drains, and engine events are in-process — so without this a
	 * FOLLOWER tab's `awaitWriteOutcome` waits on an event that can only fire in
	 * the leader's window and every outcome-dependent behaviour degrades to
	 * optimistic-only off-leader. With it, each outcome the leader emits is
	 * republished to peers and re-emitted there. Feedback plumbing ONLY: the
	 * leader stays the sole writer. Absent (native, Electron, a degraded
	 * single-writer web context) ⇒ in-process events exactly as before.
	 */
	writeOutcomeBridge?: WriteOutcomeBridge;
	/** RxDB hashFunction for the engine's scope databases. Default: RxDB's
	 * WebCrypto-based sha256. apps/main injects its platform hash implementation
	 * where WebCrypto is unavailable. */
	hashFunction?: HashFunction;
	intervals?: Partial<EngineIntervals>;
	/** Host-executed query-total fetch. The query-total retry lane arms ONLY
	 * when this port is provided (the engine cannot guess the host's total
	 * endpoint semantics). */
	queryTotal?: QueryTotalPort;
	/** Optional activity clock for idle-only maintenance lanes. */
	lastUserActivityMs?: () => number;
	/** Optional user-interaction subscription for idle-decay snap-back. */
	onUserActivity?: (listener: () => void) => () => void;
	now?: () => number;
	/** Injectable timer port. Defaults to lazy global timer delegation. */
	timers?: EngineTimers;
};

export type EngineIntervals = Record<LaneIntervalKey, number> & {
	/** Collection census cache freshness window. Default 15min. */
	censusFreshForMs: number;
};

/**
 * How long an in-flight request must have been running before a cancellation is
 * read as the SERVER failing to answer rather than the app changing its mind.
 * Matches the barcode lookup's own deadline (the fastest deadline any caller
 * imposes on hostTransport) and is five times the sustained-slowness threshold.
 */
const ABORT_AS_TIMEOUT_AFTER_MS = 10_000;
export const REBASELINE_AUDIT_DELAY_MS = 60_000;

const DEFAULT_INTERVALS: EngineIntervals = {
	...DEFAULT_LANE_INTERVALS,
	censusFreshForMs: 15 * 60_000,
};

export type ActiveScope = {
	identity: StoreScopeIdentity;
	scopeId: string;
	database: RxDatabase;
	/**
	 * The barcode carriers THIS scope materializes `payload.barcode` from (ADR
	 * 0006): read from the site's representation config at scope open and kept
	 * current by every config-fingerprint poll. Empty until the scope has
	 * hydrated — a scan then misses locally and falls back to the online resolve
	 * rather than matching on a guessed field. Hosts that resolve or edit
	 * barcodes read them here; there is no process-wide registry to consult.
	 */
	barcodeSelectors: BarcodeSelectors;
};

/** Public event union — deliberately epoch-free (invariant 1). `detail` is
 * an opaque diagnostic string, never a contract. */
export type EngineEvent =
	| { type: 'scope-switched'; scopeId: string; from: string | null }
	| {
			type: 'collection-reset';
			scopeId: string;
			collection: ResettableCollectionName;
	  }
	| {
			type: 'reset-needs-confirmation';
			scopeId: string;
			collection: typeof MUTATION_QUEUE_COLLECTION;
			detail?: string;
	  }
	| {
			type: 'guard';
			kind: 'write-dropped' | 'late-response-dropped';
			scopeId: string;
			detail?: string;
	  }
	| { type: 'bootstrap-failed'; scopeId: string; detail: string }
	// Push outcomes (slice 4): write() resolved at enqueue; these are the drain's verdicts.
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
	// A delete write() satisfied LOCALLY (gate2 #516 item 3): it cancelled a
	// never-pushed local chain (create + successors) and removed the resident
	// row — nothing was or ever will be sent. Terminal for the receipt's
	// mutationId; a DISTINCT event (not the ack shape) because there is no
	// server revision to carry and no push ever happened.
	| {
			type: 'write-annihilated';
			collection: string;
			recordId: string;
			mutationId: string;
	  }
	// Fresh query totals persisted by the retry lane (slice 5d) — the host
	// hydrates its UI caches from these.
	| QueryTotalCacheEvent
	| { type: 'config-changed'; collections: string[] }
	// Lane lifecycle (ADR 0027 §4) — the PUBLIC host/UI activity contract. `lane-start`
	// fires as a lane's work BEGINS (before any network); `lane-finish` is the completion
	// signal carrying the tick outcome. Emitted as a pair around every lane run (manual
	// sync() and the mode:'auto' timers). Deliberately NOT the SyncObserver diagnostics
	// port: UI state (active$) must not become best-effort when a host omits diagnostics.
	| { type: 'lane-start'; lane: EngineLane }
	| {
			type: 'lane-finish';
			lane: EngineLane;
			status: SyncReport['status'];
			detail?: string;
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
			/** The server's human-readable message; `reason` is the machine code. */
			serverMessage?: string;
			/**
			 * True when the rejected mutation is a CREATE with no local or queued
			 * remote id and the rejection does not imply a matching server record.
			 * These are exempt from the #1082 auto-revert (there is no server
			 * truth to restore; discard would destroy the only copy) and stay
			 * parked on `conflicts()` like an order's dead letter.
			 */
			bornLocalCreate?: boolean;
	  }
	// R1 — the save-time mirror check. The server ACKED an order the POS built, but
	// its money is not the money that was pushed: WooCommerce's calculation is the
	// source of truth, the POS mirrors it, and this is the mirror breaking. NOT a
	// terminal outcome — the write succeeded and `write-acknowledged` still follows;
	// the server's totals stand and the cashier is told to review before handing over
	// goods. Payment-time adjustments (gateway surcharges, fee plugins) happen after
	// this ack and arrive by PULL, so they can never raise it.
	| {
			type: 'order-money-divergence';
			collection: string;
			recordId: string;
			mutationId: string;
			mode: MoneyPrecisionMode;
			fields: MoneyDivergenceField[];
	  };

export type EngineStatus = {
	disposed: boolean;
	mode: 'auto' | 'manual';
	connectivity: EngineConnectivity;
	activeScopeId: string | null;
	scopesOpen: number;
	guards: { wrongScopeWrites: number; lateResponsesDropped: number };
	gatedBy: 'offline' | 'lifecycle' | 'bootstrap-failed' | null;
	lanes: Record<
		Exclude<EngineLane, 'all'>,
		{
			lastError: string | null;
			lastTick: { atMs: number; status: SyncReport['status'] } | null;
			nextDueAtMs?: number;
		}
	>;
	bootstrapFailed: Record<string, string>;
	/** Pending mutation count of the active scope (cached from the last enqueue/drain; null before either). */
	queueDepth: number | null;
	collections: Record<SyncCollectionName, EngineCollectionState>;
};

export type Unsubscribe = () => void;
/** A terminal queue entry from `conflicts()`: the write-intent plus, for status
 * 'conflicted', the server truth captured from the 409 (`conflictDocument`,
 * `conflictRevision`). Status 'needs-revision' = an unrecoverable 428 park
 * carrying NO server truth (retry refreshes first — see resolveConflict).
 * Status 'rejected' = a permanent-4xx dead letter. */
export type EngineConflict = QueuedMutation;

export type RxdbSyncEngine = {
	/** Initial store scope open + active. */
	ready: Promise<ActiveScope>;
	active(): ActiveScope | null;
	/** Emits the current database immediately on subscribe, then re-emits on
	 * every switch and reset (a reset re-emits the SAME database — captured
	 * collection references are stale, re-resolve through the database). */
	db$(cb: (db: RxDatabase | null) => void): Unsubscribe;
	scope: {
		/** Pause/resume; serialized; works offline. Same-site only. */
		switch(identity: StoreScopeIdentity): Promise<ActiveScope>;
		resetCollection(
			name: ResettableCollectionName,
			opts?: {
				confirmDestroyQueue?: boolean;
				beforeDrop?: (active: ActiveScope) => Promise<void>;
			}
		): Promise<'reset' | 'needs-confirmation'>;
	};
	/** Durable-enqueue semantics (ADR 0018): resolves when the mutation is IN
	 * the active scope's queue, never when pushed. Push outcomes are events:
	 * write-acknowledged | write-conflict | write-rejected — plus the one
	 * LOCAL terminal outcome, write-annihilated (a delete that cancelled a
	 * never-pushed local chain: the resident row is removed, nothing is sent,
	 * and the receipt's `annihilated` flag is set). Only collections with a
	 * write facet (orders today) — anything else throws (invariant 5).
	 *
	 * On web these outcomes cross tabs when the host supplies `writeOutcomeBridge`
	 * (#1209): the LEADER drains, and every peer re-emits what it publishes, so an
	 * `awaitWriteOutcome` caller in a follower tab settles with the leader's real
	 * verdict instead of timing out. */
	write(
		intent: WriteIntent
	): Promise<{ mutationId: string; recordId: string; annihilated?: boolean }>;
	/**
	 * The terminal write entries awaiting an explicit caller decision — there
	 * is NO auto-resolution, with ONE ruled exception.
	 *
	 * THE EXCEPTION (ruled 2026-08-14, #1204): an **orders** push that comes back
	 * 409 stale-revision gets exactly ONE automatic re-anchor before it lands
	 * here. The base revision is re-stamped from that 409's own `currentRevision`
	 * — the reply's, not a fetch, and not the server `current` DOCUMENT, which is
	 * never adopted over the local record — and the SAME local intent is pushed
	 * again. Only a SECOND consecutive conflict parks the row, exactly as every
	 * conflict did before. Nothing else changes: no other collection recovers
	 * (products/variations/customers/coupons still park on the first 409), a
	 * 'rejected' or 'needs-revision' row is untouched, and the save-time money
	 * mirror (`order-money-divergence`, #1033) remains the alarm for a server that
	 * genuinely disagrees. The carve-out exists because the 409s that reach an
	 * open order are not competing edits — the till owns its cart and the write
	 * plane is leader-serialized, so the drift is server-side bookkeeping (#1204:
	 * a refused delete rewrote `_reduced_stock`) — while the park it triggered
	 * wedged the order for good: every later write held, resolvable only from
	 * Store health, which a follower tab refuses. Wired in the write-drain lane
	 * (`autoRecoverConflict`), implemented in sync-core's drain.
	 *
	 * 'conflicted' rows (a 409 stale-revision push) carry
	 * the server's truth from the 409 (`conflictDocument` + `conflictRevision`);
	 * 'needs-revision' rows (an unrecoverable 428 — the server demands a
	 * precondition and no current revision could be determined) carry NO server
	 * truth: `resolveConflict('retry-with-server-base')` FIRST refreshes the
	 * revision from the server; 'rejected' rows are permanent-4xx dead letters
	 * carrying the server's verdict (`rejectedStatus` / `rejectedReason` /
	 * `rejectedMessage` / `rejectedAt`) and, once recovered at least once, their
	 * requeue provenance (`requeuedFrom` / `requeueCount`) — they resolve by
	 * 'requeue-rebuilt' or 'discard'. Rows persist here until `resolveConflict`
	 * settles them — with ONE exception (#1082): a 'rejected' row for a catalog
	 * collection (products/variations/customers/coupons, never orders) is
	 * auto-discarded moments after the `write-rejected` event, so consumers may
	 * observe it vanish asynchronously; a row whose auto-discard failed stays
	 * parked here as before. A rejected BORN-LOCAL CREATE (the resident never
	 * adopted a remote id) is carved out of that exception: there is no server
	 * truth to restore and discard would destroy the only copy, so it stays
	 * parked here like an order's dead letter.
	 */
	conflicts(): Promise<EngineConflict[]>;
	/**
	 * Settle one terminal entry from `conflicts()`:
	 *  - 'retry-with-server-base' (conflicted / needs-revision): re-stamp the
	 *    mutation's baseRevision to the SERVER's current revision — the local
	 *    intent is chosen over server truth — and return it to pending for the
	 *    next drain. A 'conflicted' row uses the revision captured from its 409;
	 *    a 'needs-revision' row (or a conflicted row whose 409 carried no
	 *    revision) first performs one targeted server refresh — if the refresh
	 *    fails or finds no revision this THROWS and the row stays parked
	 *    (re-runnable); it never re-pends on the same stale base;
	 *  - 'requeue-rebuilt' (rejected ONLY — #832): the dead letter's payload is
	 *    REBUILT from the record as it stands now and enqueued through the same
	 *    pipeline a normal write uses, so every outbound sanitizer that has
	 *    landed since the rejection applies; the replacement carries a FRESH
	 *    mutationId plus `requeuedFrom` / `requeueCount` provenance, and the dead
	 *    letter is removed once it is durably queued. Re-sending the rejected
	 *    payload would earn the same 4xx forever, which is why 'requeue-rebuilt'
	 *    and 'retry-with-server-base' are not interchangeable. Recovery is only
	 *    ever explicit — a row that dead-letters again stays requeue-able with
	 *    its count incremented, and nothing retries it automatically. THROWS,
	 *    leaving the dead letter listed, when the record is no longer resident
	 *    (nothing to rebuild from — discard instead);
	 *  - 'discard': the server-truth re-pull is queued DURABLY (a persisted
	 *    targeted scheduler task, orders with a known Woo id) BEFORE the
	 *    mutation is removed and the record's pendingMutationIds/dirty
	 *    bookkeeping clears — so a crash or a failed fetch can never leave the
	 *    local record silently posing as synced with the re-pull lost. An
	 *    immediate completion is attempted; if it cannot complete now, the
	 *    durable task self-heals on a later scheduler-drain tick (surfaced as a
	 *    `queue.write.discard-repull-deferred` diagnostics event).
	 * Throws for an unknown/non-terminal mutationId, for 'retry-with-server-base'
	 * on a rejected row, or for 'requeue-rebuilt' on anything but a rejected row.
	 */
	resolveConflict(mutationId: string, resolution: ConflictResolutionChoice): Promise<void>;
	/** Component-declared data requirement (CONTEXT.md): coverage-aware ready
	 * (serve-local without a fetch when every record is resident), priority
	 * preemption over queued demand work, release() demotion. */
	require(requirement: EngineRequirement): RequirementHandle;
	/**
	 * Reflect the host-configured transport through a frozen, read-only view.
	 * This is host transport reflection only, not a second engine transport.
	 */
	hostTransport(): EngineHostTransport;
	/** Live-tune the two facade-owned runtime controls. Values are clamped to
	 * their supported ranges before they take effect. */
	reconfigure(config: { changeSignalPollMs?: number; pullBatchSize?: number }): void;
	/** One deterministic guarded tick of the named lane. When omitted, runs
	 * every registered lane in documented dependency order. Never throws for
	 * periodic-class failures — a failed tick reports { status: 'error' } and
	 * self-heals next tick (invariant 5); post-dispose calls reject. */
	sync(lane?: EngineLane, options?: { signal?: AbortSignal }): Promise<SyncReport>;
	/** Force-refresh one collection census, then tick the shared change cursor once. */
	checkCollection(
		name: SyncCollectionName,
		options?: { signal?: AbortSignal }
	): Promise<CollectionCheckReport>;
	events(cb: (e: EngineEvent) => void): Unsubscribe;
	status(): EngineStatus;
	/** Emits the current status immediately, then coalesced status snapshots as it changes. */
	statusChanges(cb: (status: EngineStatus) => void): Unsubscribe;
	/** Emits the current census snapshot, then updated cache/scope/freshness snapshots. */
	censusChanges(cb: (totals: CensusTotals) => void): Unsubscribe;
	/**
	 * Emits the engine's coverage verdict for ONE target — how much of that query it holds and
	 * what the authoritative total is — immediately on subscribe, then on every lane /
	 * query-total write behind it, every scope switch or reset, and at each freshness deadline.
	 *
	 * The engine owns the semantics AND the lane keys: the `{lane:'reference'}` arm resolves a
	 * boot/reference collection's key internally, so a caller never constructs one (CONTEXT.md).
	 * Never throws once subscribed — no scope, no rows and no lane all publish `source:'unknown'`
	 * with `total: null`, which is the engine declining to vouch rather than an answer of zero.
	 */
	coverageChanges(target: CoverageTarget, cb: (verdict: CoverageVerdict) => void): Unsubscribe;
	/** Abort in-flight, close every scope db; terminal. */
	dispose(): Promise<void>;
};

function checkpointKeyFor(collection: SyncCollectionName): string {
	return `checkpoint:${collection}`;
}

export function createRxdbSyncEngine(
	ports: RxdbSyncEnginePorts,
	initialScope: StoreScopeIdentity
): RxdbSyncEngine {
	const mode = ports.mode ?? 'auto';
	const connectivity = ports.connectivity ?? (() => 'online' as const);
	const writePlaneOwner = ports.writePlaneOwner ?? (() => true);
	// A ledger rebuild replaces the derivable collections, and live coverage
	// subscriptions hold handles to the dropped ones (coverage-changes.ts opens
	// findOne().$ streams per target). Re-resolving through the hub swaps in the
	// fresh collections; late-bound because the hub is created further down.
	let onLedgerRebuilt: (() => void) | undefined;
	const diagnostics: SyncObserver = (event) => {
		if (event.type === 'coverage.ledger-rebuilt') {
			try {
				onLedgerRebuilt?.();
			} catch {
				// Re-resolution is best-effort; the rebuild itself already succeeded.
			}
		}
		try {
			ports.diagnostics?.(event);
		} catch {
			// The observer seam must never throw into the engine (ADR 0018).
		}
	};
	const nowMs = ports.now ?? (() => Date.now());
	const timers = ports.timers ?? systemTimers;
	const random = ports.random ?? Math.random;
	const readConnectivity = (): EngineConnectivity => {
		try {
			return connectivity();
		} catch {
			return 'offline';
		}
	};
	// #846: EVERY engine request feeds the pressure monitor — the change-signal
	// poll, the maintenance lanes AND the demand-driven pulls a cashier triggers.
	// A 429 raised by a product search is the same server saying the same thing,
	// so it counts as evidence. What it does NOT do is slow that search down:
	// only the change-signal cadence adapts (see armChangeSignalTimer). Demand
	// fetches are human-bounded — a cashier can only ask so fast — and delaying
	// one would trade the merchant's server load for the merchant's queue.
	const serverPressure = createServerPressureMonitor();
	// Assigned below, once the change-signal timer exists — a transition observed
	// before then (there is no transport before `ready`) is simply dropped.
	let cadence: CadenceController | null = null;
	const rawFetcher: EngineFetcher = ports.fetcher ?? ((url, init) => globalThis.fetch(url, init));
	const fetcher: EngineFetcher = async (url, init) => {
		const startedAtMs = nowMs();
		const observe = (
			status: number,
			retryAfter?: string | null,
			pressure?: ServerPressure,
			serverLoad1m?: number
		): void => {
			const atMs = nowMs();
			const transition = serverPressure.observe({
				atMs,
				status,
				durationMs: atMs - startedAtMs,
				offline: readConnectivity() === 'offline',
				...(retryAfter === undefined ? {} : { retryAfter }),
				...(pressure === undefined ? {} : { pressure }),
				...(serverLoad1m === undefined ? {} : { serverLoad1m }),
			});
			if (transition !== null) cadence?.onServerPressureTransition(transition);
		};
		let response: Response;
		try {
			response = await rawFetcher(url, init);
		} catch (error) {
			// Aborts are ambiguous, and BOTH readings are real:
			//  - a scope switch, disposal or superseded search cancels in-flight work,
			//    often several requests at once — counting those would invent a
			//    three-strike burst out of nothing and hand the incoming scope a
			//    phantom back-off;
			//  - a deadline abort (the barcode lookup gives the server 10s before it
			//    gives up, via hostTransport's fetcher) means the server genuinely
			//    never answered, which is exactly the timeout signal we want.
			// The honest discriminator is not WHO pulled the plug but HOW LONG the
			// request had already been running: a cancellation that young says nothing
			// about the server, while a request still unanswered after the barcode
			// deadline was not going to be answered promptly whoever cancelled it.
			// Everything else that throws here (network timeout, DNS, TLS, connection
			// reset) is an unambiguous transport failure and reports as status 0, the
			// spelling the rest of the stack uses (see apps/main transport.request).
			const abortedYoung =
				(error as { name?: unknown } | null)?.name === 'AbortError' &&
				nowMs() - startedAtMs < ABORT_AS_TIMEOUT_AFTER_MS;
			if (!abortedYoung) observe(0);
			throw error;
		}
		let retryAfter: string | null = null;
		let pressure: ServerPressure | undefined;
		let serverLoad1m: number | undefined;
		try {
			retryAfter = response.headers.get('retry-after');
			pressure = parseServerPressure(response.headers.get('x-wcpos-pressure'));
			serverLoad1m = parseServerLoad1m(response.headers.get('x-server-load'));
		} catch {
			// A host fetch stub may hand back a header-less object; never let
			// telemetry break a real response.
		}
		observe(response.status, retryAfter, pressure, serverLoad1m);
		return response;
	};
	const hostTransport: EngineHostTransport = Object.freeze({
		syncBaseUrl: ports.site.syncBaseUrl,
		fetcher,
	});
	const uuid = ports.uuid ?? webCryptoUuid;
	const initialSiteKey = canonicalSiteKey(initialScope.site);

	const identityByScopeId = new Map<string, StoreScopeIdentity>();
	const databaseByScopeId = new Map<string, RxDatabase>();
	const localCoverageByScopeId = new Map<string, LocalCoverage>();
	const dbSubscribers = new Set<(db: RxDatabase | null) => void>();
	const eventSubscribers = new Set<(e: EngineEvent) => void>();
	const statusSubscribers = new Set<(status: EngineStatus) => void>();
	let statusNotificationQueued = false;
	const scheduleStatusChange = (): void => {
		if (statusNotificationQueued || statusSubscribers.size === 0) return;
		statusNotificationQueued = true;
		queueMicrotask(() => {
			statusNotificationQueued = false;
			if (statusSubscribers.size === 0) return;
			const status = readStatus();
			for (const cb of [...statusSubscribers]) {
				try {
					cb(status);
				} catch (error) {
					diagnostics({
						type: 'engine.listener-error',
						level: 'error',
						message: `statusChanges() listener threw: ${error instanceof Error ? error.message : String(error)}`,
					});
				}
			}
		});
	};
	let disposed = false;
	const collectionActivity = new Map<SyncCollectionName, number>(
		SYNC_COLLECTION_NAMES.map((collection) => [collection, 0])
	);
	const collectionCoverageGeneration = new Map<SyncCollectionName, number>(
		SYNC_COLLECTION_NAMES.map((collection) => [collection, 0])
	);
	const changeCollectionActivity = (collection: SyncCollectionName, delta: 1 | -1): void => {
		const next = (collectionActivity.get(collection) ?? 0) + delta;
		if (next < 0) {
			collectionActivity.set(collection, 0);
			diagnostics({
				type: 'demand.activity-counter-underflow',
				level: 'error',
				collection,
			});
		} else {
			collectionActivity.set(collection, next);
		}
		scheduleStatusChange();
	};
	const withCollectionActivity = async <T>(
		collection: SyncCollectionName,
		work: () => Promise<T>
	): Promise<T> => {
		changeCollectionActivity(collection, 1);
		try {
			return await work();
		} finally {
			changeCollectionActivity(collection, -1);
		}
	};
	let announcedScopeId: string | null = null;
	const bootstrappedScopes = new Set<string>();
	/**
	 * One barcode-carrier state per scope (materialization/barcode-selectors).
	 * Keyed like `bootstrappedScopes`, and deliberately NOT dropped when a scope's
	 * database closes: hydration runs once per scope per engine, so a scope
	 * re-opened by a switch-back keeps the carriers it hydrated. Nothing here is
	 * shared between scopes, so there is nothing to reset between them — and a
	 * later engine (another site) owns its own map entirely.
	 */
	const scopeBarcodeSelectors = new Map<string, ScopeBarcodeSelectors>();
	const barcodeSelectorsOf = (scopeId: string): ScopeBarcodeSelectors => {
		const existing = scopeBarcodeSelectors.get(scopeId);
		if (existing) return existing;
		const created = createScopeBarcodeSelectors();
		scopeBarcodeSelectors.set(scopeId, created);
		return created;
	};
	const barcodeSelectorsFor = (scopeId: string): BarcodeSelectors =>
		barcodeSelectorsOf(scopeId).current();
	const bootstrapFailures = new Map<string, string>();
	const laneLastTick = new Map<EngineLane, { atMs: number; status: SyncReport['status'] }>();
	const engineStartedAtMs = nowMs();
	const recordLaneTick = (report: SyncReport, startedAtMs: number): SyncReport => {
		if (report.lane !== 'all')
			laneLastTick.set(report.lane, {
				atMs: nowMs(),
				status: report.status,
			});
		scheduleStatusChange();
		diagnostics({
			type: 'engine.lane.tick',
			level: report.status === 'error' ? 'error' : 'info',
			fields: {
				lane: report.lane,
				status: report.status,
				...(report.reason !== undefined ? { reason: report.reason } : {}),
				...(report.pushed !== undefined
					? {
							pushed: report.pushed,
							held: report.held ?? 0,
							conflicts: report.conflicts ?? 0,
							deferred: report.deferred ?? 0,
							failed: report.failed ?? 0,
							rejected: report.rejected ?? 0,
						}
					: {}),
				durationMs: nowMs() - startedAtMs,
			},
		});
		return report;
	};

	// The initial open is the one lifecycle op with no caller obliged to observe
	// its outcome: hosts render from status()/events and rarely await `ready`,
	// and readySettledForSync deliberately handles ready's rejection. A hang or
	// failure inside the open chain therefore used to produce ZERO signal —
	// status stayed gatedBy:'lifecycle' (or flipped to 'bootstrap-failed') with
	// nothing naming the blocked step. Lifecycle ops serialize (invariant 3), so
	// one phase slot suffices; the readiness watchdog below reads it while
	// `ready` is unsettled.
	let lifecyclePhase = { phase: 'constructed', sinceMs: engineStartedAtMs };
	const setLifecyclePhase = (phase: string): void => {
		lifecyclePhase = { phase, sinceMs: nowMs() };
	};

	const openScopeDatabase = async (scopeId: string): Promise<ScopeDatabase> => {
		const identity = identityByScopeId.get(scopeId);
		if (!identity) {
			throw new Error(`No identity registered for scope ${scopeId}`);
		}
		if (ports.databaseOpenBarrier) {
			setLifecyclePhase('database-open-barrier');
			await ports.databaseOpenBarrier;
		}
		setLifecyclePhase('create-database');
		const storage = typeof ports.storage === 'function' ? ports.storage(identity) : ports.storage;
		const db = await createRxDatabase({
			name: scopeDatabaseName(identity),
			storage,
			// Adapter counts run payload selectors (for example meta_data $elemMatch) with no index.
			// Storage executes them worker-side in production, matching the legacy 1.9 configuration.
			allowSlowCount: true,
			// Cross-tab change propagation is the HOST's call (ports.multiInstance,
			// apps/main enables this where it runs multiple instances; harnesses and
			// single-window hosts keep the single-instance default.
			multiInstance: ports.multiInstance ?? false,
			...(ports.hashFunction !== undefined ? { hashFunction: ports.hashFunction } : {}),
		});
		try {
			setLifecyclePhase('add-collections');
			await db.addCollections(engineCollectionCreators() as never);
			setLifecyclePhase('legacy-cursor-migrate');
			const engineCheckpoint =
				await db.collections[ENGINE_KV_COLLECTION].findOne(CHANGE_SIGNAL_STATE_KEY).exec();
			if (!engineCheckpoint) {
				const legacyCheckpoint = await db.collections.changeSignalStates
					.findOne(CHANGE_SIGNAL_STATE_ID)
					.exec();
				if (legacyCheckpoint) {
					const legacy = legacyCheckpoint.toJSON() as { state: string };
					await db.collections[ENGINE_KV_COLLECTION].upsert({
						id: CHANGE_SIGNAL_STATE_KEY,
						value: legacy.state,
					});
				}
			}
		} catch (error) {
			await db.close();
			throw error;
		}
		try {
			const pruneTargeted = (
				manifest: 'existenceManifest' | 'existenceManifestCustomers',
				collection: 'products' | 'variations' | 'customers',
				field: 'remoteId',
				wooIds: number[]
			) => removeTargeted(db, db.collections[manifest] as never, collection, field, wooIds);
			const coverage = createLocalCoverage({
				database: db as never,
				manifest: {
					fetcher: (url, init) => fetcher(url, init?.signal ? { signal: init.signal } : undefined),
					syncBaseUrl: ports.site.syncBaseUrl,
					pruneDeleted: {
						product: (wooIds) => pruneTargeted('existenceManifest', 'products', 'remoteId', wooIds),
						variation: (wooIds) =>
							pruneTargeted('existenceManifest', 'variations', 'remoteId', wooIds),
						customer: (wooIds) =>
							pruneTargeted('existenceManifestCustomers', 'customers', 'remoteId', wooIds),
						order: (wooIds) =>
							new EngineOrderRepository(db.collections as never).removeDeletedOrders(
								wooIds.map((wooId) => mintRemoteId(wooId, 'order prune id'))
							),
					},
				},
				reconcile: createReconcilePorts({
					database: db,
					fetcher,
					ports,
				}),
				reconcileCursorStore: {
					get: (key) => readBlob(scopeId, key),
					set: (key, value) => writeBlob(scopeId, key, value),
				},
				freshForMs: ORDER_SCHEDULER_COVERAGE_FRESH_FOR_MS,
				retainStaleForMs: COVERAGE_COMPACTION_RETAIN_STALE_FOR_MS,
				diagnostics,
				...(ports.now !== undefined ? { now: ports.now } : {}),
			});
			// Registration is last: openScopeDatabase either returns (and the manager then
			// registers the scope in its own map) or throws with both outer maps clean. An
			// outer entry the manager cannot close would make dispose's closeScope loop
			// spin forever — closeScope no-ops on a scope the manager never registered.
			databaseByScopeId.set(scopeId, db);
			localCoverageByScopeId.set(scopeId, coverage);
			return {
				listCollections: () => [...SYNC_COLLECTION_NAMES, MUTATION_QUEUE_COLLECTION],
				resetCollection: async (name) => {
					if (!isResettableCollection(name)) {
						throw new Error(`Cannot reset unknown collection "${name}"`);
					}
					await resetEngineCollection(db, name);
				},
				pendingMutationCount: () => db.collections[MUTATION_QUEUE_RXDB_COLLECTION].count().exec(),
				close: async () => {
					databaseByScopeId.delete(scopeId);
					localCoverageByScopeId.delete(scopeId);
					await db.close();
				},
			};
		} catch (error) {
			databaseByScopeId.delete(scopeId);
			localCoverageByScopeId.delete(scopeId);
			await db.close().catch(() => undefined);
			throw error;
		}
	};

	const manager = new StoreScopeManager({
		createDatabase: openScopeDatabase,
		...(ports.now !== undefined ? { now: ports.now } : {}),
	});

	/** The engine-owned default: checkpoint/cursor keys live inside the scope's
	 * own database, so per-scope isolation and volatile-db-volatile-cursor both
	 * fall out of storage placement. A host-provided store gets the scope id
	 * namespaced into the key instead. */
	const readBlob = async (scopeId: string, key: string): Promise<string | null> => {
		if (ports.checkpoints) {
			return ports.checkpoints.get(`${scopeId}:${key}`);
		}
		const db = databaseByScopeId.get(scopeId);
		if (!db) return null;
		const doc = await db.collections[ENGINE_KV_COLLECTION].findOne(key).exec();
		return doc ? (doc.toJSON() as { value: string }).value : null;
	};
	const writeBlob = async (scopeId: string, key: string, value: string): Promise<void> => {
		if (ports.checkpoints) {
			await ports.checkpoints.set(`${scopeId}:${key}`, value);
			return;
		}
		const db = databaseByScopeId.get(scopeId);
		if (!db) throw new Error(`Cannot persist "${key}": scope ${scopeId} has no open database`);
		await db.collections[ENGINE_KV_COLLECTION].upsert({ id: key, value });
	};
	const removeBlob = async (scopeId: string, key: string): Promise<void> => {
		if (ports.checkpoints) {
			await ports.checkpoints.remove(`${scopeId}:${key}`);
			return;
		}
		const db = databaseByScopeId.get(scopeId);
		if (!db) return;
		const doc = await db.collections[ENGINE_KV_COLLECTION].findOne(key).exec();
		if (doc) await (doc as { remove(): Promise<unknown> }).remove();
	};
	const removeCheckpoint = (scopeId: string, collection: SyncCollectionName): Promise<void> =>
		removeBlob(scopeId, checkpointKeyFor(collection));

	// Invariant 2: reset clears only per-COLLECTION checkpoint, trickle, manifest,
	// scheduler-task, and coverage state. The shared change-signal cursor stays:
	// later signals targeted-fetch wiped records through normal apply arms, while
	// an empty existence manifest derives zero reconcile buckets instead of bulk-healing.
	for (const collection of SYNC_COLLECTION_NAMES) {
		manager.registerCursorInvalidator(collection, (scopeId) =>
			removeCheckpoint(scopeId, collection)
		);
	}
	manager.registerCursorInvalidator('customers', (scopeId) =>
		removeBlob(scopeId, CUSTOMER_TRICKLE_STATE_KEY)
	);
	manager.registerCursorInvalidator('products', (scopeId) =>
		removeBlob(scopeId, PRODUCT_TRICKLE_STATE_KEY)
	);
	for (const collection of ['products', 'variations'] as const) {
		manager.registerCursorInvalidator(collection, (scopeId) =>
			removeBlob(scopeId, VARIATION_PREFETCH_STATE_KEY)
		);
	}

	const registerManifestInvalidator = (
		collection: 'products' | 'variations' | 'customers' | 'orders',
		manifestName: 'existenceManifest' | 'existenceManifestCustomers' | 'existenceManifestOrders',
		objectType: 'product' | 'variation' | 'customer' | 'order'
	) =>
		manager.registerCursorInvalidator(collection, async (scopeId) => {
			const db = databaseByScopeId.get(scopeId);
			if (!db) return;
			const manifest = db.collections[manifestName];
			const docs = await manifest.find({ selector: { objectType } }).exec();
			if (docs.length > 0)
				assertBulkSuccess(
					await manifest.bulkRemove(docs.map((doc) => doc.primary)),
					'create-rxdb-sync-engine remove'
				);
		});
	registerManifestInvalidator('products', 'existenceManifest', 'product');
	// A variations reset clears the PRODUCT manifest rows too: they share the
	// existenceManifest, and surviving product rows would otherwise keep those
	// buckets in the next audit. Product rows re-prime cheaply from resident docs
	// on the next existence-prime tick.
	registerManifestInvalidator('variations', 'existenceManifest', 'product');
	registerManifestInvalidator('variations', 'existenceManifest', 'variation');
	registerManifestInvalidator('customers', 'existenceManifestCustomers', 'customer');
	registerManifestInvalidator('orders', 'existenceManifestOrders', 'order');

	for (const collection of SYNC_COLLECTION_NAMES) {
		manager.registerCursorInvalidator(collection, async (scopeId) => {
			const db = databaseByScopeId.get(scopeId);
			if (!db) return;
			const schedulerTasks = db.collections.schedulerTaskStates;
			const taskDocs = await schedulerTasks
				.find({ selector: { collectionName: collection } })
				.exec();
			if (taskDocs.length > 0)
				assertBulkSuccess(
					await schedulerTasks.bulkRemove(taskDocs.map((doc) => doc.primary)),
					'create-rxdb-sync-engine remove'
				);
			const coverageRecords = db.collections.coverageRecords;
			const recordDocs = await coverageRecords
				.find({ selector: { collectionName: collection } })
				.exec();
			if (recordDocs.length > 0)
				assertBulkSuccess(
					await coverageRecords.bulkRemove(recordDocs.map((doc) => doc.primary)),
					'create-rxdb-sync-engine remove'
				);
			const coverageLanes = db.collections.coverageLanes;
			const laneDocs = await coverageLanes
				.find({ selector: { collectionName: collection } })
				.exec();
			if (laneDocs.length > 0)
				assertBulkSuccess(
					await coverageLanes.bulkRemove(laneDocs.map((doc) => doc.primary)),
					'create-rxdb-sync-engine remove'
				);
		});
	}

	const emitEngineEvent = (event: EngineEvent): void => {
		for (const cb of [...eventSubscribers]) {
			try {
				cb(event);
			} catch (error) {
				diagnostics({
					type: 'engine.listener-error',
					level: 'error',
					message: `events() listener threw: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		}
		if (event.type === 'query-total-cache') censusPublisher.publish();
	};

	// CROSS-TAB WRITE OUTCOMES (#1209). A peer's outcome enters at the subscriber
	// fan-out, NOT at `emitWriteEvent`: that funnel carries #1082's auto-revert,
	// which must run once and only in the leader (a follower's `resolveConflict`
	// refuses outright). Entering here also makes an echo impossible — a received
	// event is never re-published.
	const unsubscribeWriteOutcomeBridge = ports.writeOutcomeBridge?.subscribe((event) => {
		if (disposed) return;
		emitEngineEvent(event);
	});

	// `activeDatabase` is read lazily: the hub outlives every scope, and a reset re-emits the
	// SAME database with fresh collections, so it must resolve through the accessor each time.
	const coverageChangeHub = createCoverageChangeHub({
		activeDatabase: () => activeDatabase(),
		now: nowMs,
		diagnostics,
	});
	// #1187 review: the ledger rebuild drops coverageLanes/queryTotalCacheEntries,
	// and every live hub subscription is a findOne().$ stream on the OLD
	// collection objects. Republish re-resolves each target against the rebuilt
	// collections instead of leaving verdicts frozen on dead streams.
	onLedgerRebuilt = () => coverageChangeHub.republish();

	const emitDb = (db: RxDatabase | null): void => {
		for (const cb of [...dbSubscribers]) {
			try {
				cb(db);
			} catch (error) {
				diagnostics({
					type: 'engine.listener-error',
					level: 'error',
					message: `db$ listener threw: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		}
		censusPublisher.publish();
		coverageChangeHub.republish();
	};

	const activeDatabase = (): RxDatabase | null => {
		const scopeId = manager.activeScope;
		return scopeId === null ? null : (databaseByScopeId.get(scopeId) ?? null);
	};
	const censusPublisher = createCensusPublisher<RxDatabase>({
		cache: {
			readForQueryKeys: async (keys, capturedDatabase) => {
				const database = capturedDatabase ?? activeDatabase();
				return database === null
					? null
					: withLedgerRecovery({
							database,
							trigger: 'query-total',
							create: () => new RxQueryTotalCacheRepository(database as never),
						}).readForQueryKeys(keys);
			},
		},
		now: nowMs,
		diagnostics,
		...(ports.timers === undefined ? {} : { timers: ports.timers }),
	});

	manager.onEvent((event: ScopeEvent) => {
		switch (event.type) {
			case 'switched': {
				for (const collection of SYNC_COLLECTION_NAMES) {
					collectionCoverageGeneration.set(
						collection,
						(collectionCoverageGeneration.get(collection) ?? 0) + 1
					);
				}
				const from = announcedScopeId;
				announcedScopeId = event.scopeId;
				emitEngineEvent({
					type: 'scope-switched',
					scopeId: event.scopeId,
					from,
				});
				emitDb(activeDatabase());
				scheduleStatusChange();
				return;
			}
			case 'reset': {
				if (SYNC_COLLECTION_NAMES.includes(event.detail as SyncCollectionName)) {
					const collection = event.detail as SyncCollectionName;
					collectionCoverageGeneration.set(
						collection,
						(collectionCoverageGeneration.get(collection) ?? 0) + 1
					);
				}
				diagnostics({
					type: 'engine.collection-reset',
					level: 'info',
					collection: event.detail,
					fields: { scopeId: event.scopeId },
				});
				emitEngineEvent({
					type: 'collection-reset',
					scopeId: event.scopeId,
					collection: event.detail as ResettableCollectionName,
				});
				emitDb(activeDatabase());
				scheduleStatusChange();
				return;
			}
			case 'needs-confirmation': {
				diagnostics({
					type: 'engine.reset-needs-confirmation',
					level: 'warn',
					collection: 'mutations',
					fields: { scopeId: event.scopeId },
				});
				emitEngineEvent({
					type: 'reset-needs-confirmation',
					scopeId: event.scopeId,
					collection: MUTATION_QUEUE_COLLECTION,
					...(event.detail !== undefined ? { detail: event.detail } : {}),
				});
				return;
			}
			case 'write-dropped':
			case 'late-response-dropped': {
				// The guard counter already incremented — status subscribers must see it.
				scheduleStatusChange();
				diagnostics({
					type: 'engine.guard',
					level: 'warn',
					fields: { scopeId: event.scopeId, outcome: event.type },
				});
				emitEngineEvent({
					type: 'guard',
					kind: event.type,
					scopeId: event.scopeId,
					...(event.detail !== undefined ? { detail: event.detail } : {}),
				});
				return;
			}
		}
	});

	const activeScopeOf = (scopeId: string): ActiveScope => {
		const identity = identityByScopeId.get(scopeId);
		const database = databaseByScopeId.get(scopeId);
		if (!identity || !database) {
			throw new Error(`Scope ${scopeId} is not open`);
		}
		return {
			identity,
			scopeId,
			database,
			barcodeSelectors: barcodeSelectorsFor(scopeId),
		};
	};

	const assertNotDisposed = (): void => {
		if (disposed) {
			throw new Error('RxdbSyncEngine is disposed');
		}
	};

	/**
	 * Facade-level FIFO for the lifecycle ops (invariant 3): switch, reset and
	 * dispose queue here IN CALL ORDER, and each task runs only after the prior
	 * one settled — so a reset enqueued behind a pending switch resolves its
	 * target scope AFTER that switch completed, and dispose sees every scope a
	 * queued switch opened. The manager has its own internal chain, but that
	 * alone cannot order the facade's activeScope READS against queued ops.
	 */
	let lifecycleChain: Promise<unknown> = Promise.resolve();
	// Invariant 3's sync() half: a tick must not race a pending switch/reset —
	// it could capture (and persist a cursor for) the outgoing scope mid-
	// transition. sync() checks this counter and returns skipped instead.
	let pendingLifecycleOps = 0;
	let rebaselineGeneration = 0;
	// True from the moment a rebaseline chain starts (seeds included) until its audit
	// hold resolves or is cancelled — the window in which interval-dispatched audit
	// ticks must stand down (codex-review P2: a due interval landing pre- or mid-hold
	// would otherwise sneak audit traffic into the open path the hold protects).
	let rebaselineHoldActive = false;
	let pendingRebaselineDelay: {
		handle: ReturnType<typeof setTimeout>;
		resolve: (elapsed: boolean) => void;
	} | null = null;
	const cancelPendingRebaselineAudit = (): void => {
		rebaselineGeneration += 1;
		rebaselineHoldActive = false;
		if (pendingRebaselineDelay === null) return;
		timers.clearTimeout(pendingRebaselineDelay.handle);
		pendingRebaselineDelay.resolve(false);
		pendingRebaselineDelay = null;
	};
	const waitForRebaselineAuditWindow = (generation: number): Promise<boolean> => {
		if (disposed || generation !== rebaselineGeneration) return Promise.resolve(false);
		return new Promise<boolean>((resolve) => {
			const handle = timers.setTimeout(() => {
				pendingRebaselineDelay = null;
				resolve(!disposed && generation === rebaselineGeneration);
			}, REBASELINE_AUDIT_DELAY_MS);
			pendingRebaselineDelay = { handle, resolve };
			timers.unref(handle);
		});
	};
	const enqueueLifecycle = <T>(task: () => Promise<T>): Promise<T> => {
		pendingLifecycleOps += 1;
		// gatedBy flips to 'lifecycle' NOW — subscribers see the gate while the
		// (potentially long) operation runs, not only after it settles.
		scheduleStatusChange();
		const run = lifecycleChain.then(task, task);
		lifecycleChain = run.then(
			() => undefined,
			() => undefined
		);
		// .then with both arms, NOT .finally — a voided .finally would re-raise a
		// rejected run as an unhandled rejection.
		void run.then(
			() => {
				pendingLifecycleOps -= 1;
				scheduleStatusChange();
			},
			() => {
				pendingLifecycleOps -= 1;
				scheduleStatusChange();
			}
		);
		return run;
	};

	const switchScope = (identity: StoreScopeIdentity): Promise<ActiveScope> => {
		assertNotDisposed();
		if (canonicalSiteKey(identity.site) !== initialSiteKey) {
			throw new Error(
				`Cross-site scope switch rejected: engine is bound to site "${initialScope.site}" — multi-site is a new engine (ADR 0018)`
			);
		}
		cancelPendingRebaselineAudit();
		const scopeId = scopeKeyFor(identity);
		identityByScopeId.set(scopeId, identity);
		return enqueueLifecycle(async () => {
			setLifecyclePhase('scope-open');
			await manager.switchTo(scopeId);
			if (!bootstrappedScopes.has(scopeId)) {
				const database = databaseByScopeId.get(scopeId);
				if (!database) throw new Error(`Scope ${scopeId} opened without a database`);
				setLifecyclePhase('barcode-selector-hydrate');
				// The carriers land on THIS scope, so a failed hydration leaves this
				// scope empty (online-fallback scans) without touching any other
				// scope's — no reset, and nothing another engine could inherit.
				const barcodeSelectors = barcodeSelectorsOf(scopeId);
				// Each ATTEMPT starts from empty. This block re-runs whenever the scope
				// has not bootstrapped yet (a failed seed leaves it so), and carriers a
				// previous attempt resolved must not outlive an attempt that fails —
				// the site's barcode setting may have changed in between.
				barcodeSelectors.beginHydrationAttempt();
				const hydrationAbort = new AbortController();
				const hydrationTimeout = setTimeout(() => hydrationAbort.abort(), 5_000);
				try {
					await Promise.race([
						hydrateBarcodeSelectors({
							fetcher,
							syncBaseUrl: ports.site.syncBaseUrl,
							publishBarcodeSelectors: (collection, selectors) =>
								barcodeSelectors.publish(collection, selectors),
							signal: hydrationAbort.signal,
						}),
						new Promise<never>((_, reject) =>
							hydrationAbort.signal.addEventListener(
								'abort',
								() => reject(new Error('barcode selector hydration timed out')),
								{ once: true }
							)
						),
					]);
				} catch (error) {
					// Bootstrap seeds (and pulls) into this scope with no carriers, so
					// its documents carry no barcode until the recovery re-pulls them.
					barcodeSelectors.noteHydrationFailed();
					diagnostics({
						type: 'engine.barcode-selector-hydrate-failed',
						level: 'debug',
						message: error instanceof Error ? error.message : String(error),
						fields: { scopeId },
					});
				} finally {
					clearTimeout(hydrationTimeout);
				}
				setLifecyclePhase('pos-bootstrap-seed');
				try {
					await seedPosBootstrapLanes({
						database: database,
						...(ports.now !== undefined ? { nowMs: ports.now() } : {}),
					});
					bootstrappedScopes.add(scopeId);
					bootstrapFailures.delete(scopeId);
					scheduleStatusChange();
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					bootstrapFailures.set(scopeId, message);
					scheduleStatusChange();
					diagnostics({
						type: 'engine.pos-bootstrap-error',
						level: 'warn',
						message: `POS bootstrap seed failed: ${message}`,
						fields: { scopeId },
					});
					emitEngineEvent({
						type: 'bootstrap-failed',
						scopeId,
						detail: message,
					});
				}
			}
			diagnostics({
				type: 'engine.scope-switched',
				level: 'info',
				message: `active scope: ${scopeId}`,
			});
			setLifecyclePhase('idle');
			return activeScopeOf(scopeId);
		});
	};

	// --- The change-signal lane (slice 3) --------------------------------------
	const intervals: EngineIntervals = {
		...DEFAULT_INTERVALS,
		...ports.intervals,
	};
	const changeSignalLane = createChangeSignalLane({
		manager,
		databaseFor: (scopeId) => databaseByScopeId.get(scopeId) ?? null,
		fetcher,
		syncBaseUrl: ports.site.syncBaseUrl,
		readBlob,
		writeBlob,
		connectivity: () => {
			try {
				return connectivity();
			} catch {
				return 'offline';
			}
		},
		diagnostics,
		emitEvent: emitEngineEvent,
		withCollectionActivity,
		pullBatchSize: () => cadence?.pullBatchSize(),
		barcodeSelectorsFor: (scopeId) => barcodeSelectorsOf(scopeId),
		...(ports.now !== undefined ? { now: ports.now } : {}),
	});
	const requirePlane = createRequirePlane({
		// Lazy: readySettledForSync is created after `ready` below; requirements
		// enqueued before then await the settled initial open, never 'no active scope'.
		awaitReady: () => readySettledForSync,
		manager,
		databaseFor: (scopeId) => databaseByScopeId.get(scopeId) ?? null,
		coverageFor: (scopeId) => localCoverageByScopeId.get(scopeId) ?? null,
		barcodeSelectorsFor,
		fetcher,
		syncBaseUrl: ports.site.syncBaseUrl,
		diagnostics,
		onActivityChange: changeCollectionActivity,
		pullBatchSize: () => cadence?.pullBatchSize(),
		censusFreshForMs: intervals.censusFreshForMs,
		customerSearchCatalogComplete: async () => {
			const scopeId = manager.activeScope;
			const database = scopeId === null ? null : databaseByScopeId.get(scopeId);
			if (!scopeId || !database) return false;
			const state = decodeCustomerTrickleState(await readBlob(scopeId, CUSTOMER_TRICKLE_STATE_KEY));
			if (!state.walkComplete) return false;
			const entry = await censusPublisher.freshEntry('customers', database);
			if (entry === null) return false;
			// The born-local customer:default sentinel is not part of the server census — counting
			// it would let a walk that is one real customer short read as complete and suppress
			// the remote search for exactly that customer. Exclude it by its literal storage id.
			const [count, sentinel] = await Promise.all([
				database.collections.customers.count().exec(),
				database.collections.customers.findByIds(['customer:default']).exec(),
			]);
			return count - sentinel.size >= entry.totalMatchingRecords;
		},
		...(ports.now !== undefined ? { now: ports.now } : {}),
	});
	const writePlane = createWritePlane({
		assertUsable: assertNotDisposed,
		settled: async (kind) => {
			await readySettledForSync;
			if (kind === 'read') return;
			assertNotDisposed();
			while (pendingLifecycleOps > 0) {
				await lifecycleChain;
				assertNotDisposed();
			}
		},
		manager,
		databaseFor: (scopeId) => databaseByScopeId.get(scopeId) ?? null,
		fetcher,
		syncBaseUrl: ports.site.syncBaseUrl,
		mintUuid: uuid,
		now: nowMs,
		diagnostics,
		onStatusChanged: scheduleStatusChange,
		connectivity: () => {
			try {
				return connectivity();
			} catch {
				return 'offline';
			}
		},
		isWritePlaneOwner: writePlaneOwner,
		emitWriteEvent: (event) => {
			emitEngineEvent(event);
			// #1209: the same outcome, to the other tabs. AFTER the local emit, so a
			// slow or broken channel can never delay this window's own feedback, and
			// only for outcomes THIS instance produced — a bridged event never comes
			// back through here.
			ports.writeOutcomeBridge?.publish(event);
			if (event.type !== 'write-rejected' || !AUTO_REVERT_COLLECTIONS.has(event.collection)) {
				return;
			}
			// A refused BORN-LOCAL CREATE never auto-discards: #1082's revert means
			// "restore server truth", and a record the server refused to create has
			// none — `discard` would DESTROY the only copy of what the cashier typed
			// (#832 R7b is scoped to the cashier-confirmed Store health dialog, which
			// warns before deleting). It dead-letters like an order instead: Store
			// health lists the rejected row and "Send again" rebuilds the payload
			// from the kept resident.
			if (event.bornLocalCreate === true) {
				return;
			}
			// Reactive revert (#1082): a rejected catalog change is settled for the
			// cashier by restoring server truth, through the SAME discard machinery
			// Store Health uses — claim serialization, in-guard successor overlay
			// (a newer queued edit's resident value survives the restore; see the
			// `successors` merge in conflict-resolution.ts), barcode selectors,
			// tombstone when the server no longer has the record. A write() landing
			// exactly between that overlay's read and its upsert can still flash
			// server truth for a beat — accepted: the newer mutation's queue row
			// survives and the next drain re-decides the record either way.
			void (async () => {
				try {
					await writePlane.resolveConflict(event.mutationId, 'discard');
					diagnostics({
						type: 'queue.write.auto-reverted',
						level: 'error',
						collection: event.collection,
						message:
							event.serverMessage ?? event.reason ?? 'Rejected change reverted to server truth',
						fields: {
							collection: event.collection,
							recordId: event.recordId,
							mutationId: event.mutationId,
							...(event.status !== undefined ? { status: event.status } : {}),
							...(event.reason !== undefined ? { reason: event.reason } : {}),
							...(event.serverMessage !== undefined ? { serverMessage: event.serverMessage } : {}),
						},
					});
				} catch {
					// The rejected row stays parked for Store Health when discard cannot settle it.
				}
			})();
		},
		onActivityChange: changeCollectionActivity,
		barcodeSelectorsFor,
		persistOrderRepull: async ({ database, remoteIds, nowMs: repullNowMs }) => {
			await seedTargetedOrderSchedulerTask({
				remoteIds,
				priority: 1_000,
				completedDedupeForMs: 0,
				...(repullNowMs === undefined ? {} : { nowMs: repullNowMs }),
				database,
			});
		},
		repullOrdersNow: async ({ remoteIds, reason }) => {
			await requirePlane.require({
				id: reason,
				collection: 'orders',
				kind: 'targeted-records',
				remoteIds,
				forceRefresh: true,
				priority: 1_000,
			}).ready;
		},
	});

	// --- The maintenance lanes (slice 5d) --------------------------------------
	let maintenanceOwnerId: string | null = null;
	const maintenanceLanes = createMaintenanceLanes({
		manager,
		databaseFor: (scopeId) => databaseByScopeId.get(scopeId) ?? null,
		coverageFor: (scopeId) => localCoverageByScopeId.get(scopeId) ?? null,
		barcodeSelectorsFor,
		syncBaseUrl: ports.site.syncBaseUrl,
		fetcher,
		connectivity: () => {
			try {
				return connectivity();
			} catch {
				return 'offline';
			}
		},
		diagnostics,
		withCollectionActivity,
		ownerId: () => (maintenanceOwnerId ??= `engine-${uuid()}`),
		pullBatchSize: () => cadence?.pullBatchSize(),
		...(ports.queryTotal !== undefined ? { queryTotal: ports.queryTotal } : {}),
		censusFreshForMs: intervals.censusFreshForMs,
		customerTrickleStateFor: (scopeId) => ({
			get: (key) => readBlob(scopeId, key),
			set: (key, value) => writeBlob(scopeId, key, value),
		}),
		censusTotals: () => censusPublisher.totals(),
		// The lane body runs inside guardWrite; a scope switch drains it before changing
		// manager.activeScope, so this active census read remains bound to the lane's database.
		customerCensusTotal: async () => (await censusPublisher.totals()).customers,
		productTrickleStateFor: (scopeId) => ({
			get: (key) => readBlob(scopeId, key),
			set: (key, value) => writeBlob(scopeId, key, value),
		}),
		productCensusTotal: async () => (await censusPublisher.totals()).products,
		variationPrefetchStateFor: (scopeId) => ({
			get: (key) => readBlob(scopeId, key),
			set: (key, value) => writeBlob(scopeId, key, value),
		}),
		variationCensusTotal: async () => (await censusPublisher.totals()).variations,
		hasPendingInteractiveWork: requirePlane.hasPendingWork,
		...(ports.lastUserActivityMs !== undefined
			? { lastUserActivityMs: ports.lastUserActivityMs }
			: {}),
		emitEvent: (event: QueryTotalCacheEvent) => emitEngineEvent(event),
		...(ports.now !== undefined ? { now: ports.now } : {}),
		isServerBackingOff: (atMs) => serverPressure.isBackingOff(atMs),
		isServerRetryAfterActive: (atMs) => serverPressure.retryAfterUntilMs() > atMs,
	});

	type LaneTarget = {
		tick(signal?: AbortSignal): Promise<SyncReport>;
		lastError(): string | null;
	};
	const laneTargets: Record<LaneTargetKey, LaneTarget | null> = {
		changeSignal: changeSignalLane,
		writeDrain: writePlane,
		...maintenanceLanes,
	};
	const dispatchLaneTick = (name: EngineLane, signal?: AbortSignal): Promise<SyncReport> => {
		const target = laneTargets[laneRegistryEntry(name).targetKey];
		if (target === null) {
			return Promise.resolve({
				lane: name,
				status: 'skipped',
				reason: 'no queryTotal port provided',
			});
		}
		if (name === 'change-signal') {
			return target.tick(signal).then((report) => {
				// A rebaseline consumed the skipped sequence-log history; whatever
				// those rows would have delivered that the targeted re-pull cannot
				// (server-side CREATES, a reset collection's refill) converges through
				// the existence/seed lanes. Open and drain the product window now, then
				// hold the audit outside the cashier's opening window.
				// Manual mode is untouched: an all-lane sync() already runs these
				// lanes after change-signal in the same ordered pass, and a targeted
				// manual tick stays exactly one lane (deterministic tests).
				if (report.rebaselined === true && mode === 'auto' && !disposed) {
					cancelPendingRebaselineAudit();
					const generation = rebaselineGeneration;
					rebaselineHoldActive = true;
					void (async () => {
						for (const lane of REBASELINE_RETICK_LANES.slice(0, 2)) {
							await automaticTickGate.runLane(lane);
						}
						if (!(await waitForRebaselineAuditWindow(generation))) return;
						// Revalidate the generation AFTER the wait resolves (coderabbit r3760789110):
						// a newer rebaseline superseding this continuation must keep ITS hold — a
						// stale continuation clearing the flag would unguard the new chain's open
						// window, and its audit runs would race the new chain's seeds.
						if (generation !== rebaselineGeneration || disposed) return;
						// Clear the stand-down BEFORE dispatching, so the chain's own audit
						// runs are never blocked by the guard they resolve.
						rebaselineHoldActive = false;
						for (const lane of REBASELINE_RETICK_LANES.slice(2)) {
							await automaticTickGate.runLane(lane);
						}
					})().catch(() => undefined);
				}
				return report;
			});
		}
		return target.tick(signal);
	};
	// Every lane runs through here: emit lane-start before the work begins (before any
	// network), run the tick, then emit lane-finish carrying the outcome. Lanes are
	// contracted to RESOLVE with a status (never throw) — the catch only guarantees the
	// finish half if that contract is ever broken, then re-raises.
	const tickLaneWithEvents = async (
		name: EngineLane,
		signal?: AbortSignal,
		// A variant tick of the SAME registered lane (a manual census check) — the
		// override keeps lane events, activity counters, and the census publish on
		// the standard path instead of minting a parallel uninstrumented lane.
		tickOverride?: (signal?: AbortSignal) => Promise<SyncReport>
	): Promise<SyncReport> => {
		const ownedCollections = laneRegistryEntry(name).collections;
		for (const collection of ownedCollections) changeCollectionActivity(collection, 1);
		emitEngineEvent({ type: 'lane-start', lane: name });
		let report: SyncReport;
		try {
			report = await (tickOverride !== undefined
				? tickOverride(signal)
				: dispatchLaneTick(name, signal));
		} catch (error) {
			emitEngineEvent({
				type: 'lane-finish',
				lane: name,
				status: 'error',
				detail: error instanceof Error ? error.message : String(error),
			});
			throw error;
		} finally {
			for (const collection of ownedCollections) changeCollectionActivity(collection, -1);
		}
		emitEngineEvent({
			type: 'lane-finish',
			lane: name,
			status: report.status,
			...(report.reason !== undefined
				? { detail: report.reason }
				: report.error !== undefined
					? { detail: report.error }
					: {}),
		});
		if (name === 'query-total-retry') censusPublisher.publish();
		return report;
	};
	const automaticTickGate = createAutomaticTickGate({
		isGated: () => pendingLifecycleOps > 0,
		connectivity: readConnectivity,
		now: nowMs,
		diagnostics,
		onStatusChange: scheduleStatusChange,
		tickLane: (lane) => {
			// The rebaseline hold gates ALL automatic audit dispatch, not just the
			// rebaseline-spawned chain: a due 15/17-min interval landing inside the
			// 60s window must not sneak audit traffic into the open path it protects
			// (codex-review P2). The interval simply retries next cadence; the held
			// chain itself runs only after the hold resolves, so it is never blocked
			// by this guard. Manual sync() does not pass through this gate.
			if (rebaselineHoldActive && (lane === 'existence-prime' || lane === 'existence-reconcile')) {
				// Emit the lane event pair here — the stand-down bypasses tickLaneWithEvents,
				// and a silent skip would be invisible to hosts watching lane activity.
				emitEngineEvent({ type: 'lane-start', lane });
				emitEngineEvent({
					type: 'lane-finish',
					lane,
					status: 'skipped',
					detail: 'rebaseline-hold',
				});
				return Promise.resolve<SyncReport>({
					lane,
					status: 'skipped',
					reason: 'rebaseline-hold',
				});
			}
			return tickLaneWithEvents(lane);
		},
		recordTick: (report, startedAtMs) => {
			recordLaneTick(report, startedAtMs);
		},
		seedRetickLanes: SEED_RETICK_LANES,
	});

	// The orders scheduler fetcher's custom-pull checkpoint (+ F8 epoch) lives
	// in the scope's syncCheckpoints collection (slice 5e), NOT the engine kv
	// store — an orders reset must rewind it too, or the persisted drain
	// resumes a stale cursor over the emptied collection (the apps/main host's
	// increment-2 contract, engine-owned per invariant 2). Rewind-to-zero via
	// the same repository write the F8 epoch flow uses; the stored epoch is
	// preserved by that write.
	manager.registerCursorInvalidator('orders', async (scopeId) => {
		const db = databaseByScopeId.get(scopeId);
		if (!db) return;
		await new EngineOrderRepository(db as never).writeCustomPullCheckpoint(
			normalizeCheckpoint(null)
		);
	});

	const ready: Promise<ActiveScope> = switchScope(initialScope);
	// sync() waits for the initial open to SETTLE (not succeed — a failed boot
	// surfaces through `ready`; the tick then reports no-active-scope).
	const readySettledForSync = ready.then(
		() => undefined,
		() => undefined
	);
	const readinessWatchdog = armReadinessWatchdog({
		ready,
		phase: () => lifecyclePhase,
		now: nowMs,
		diagnostics,
		...(ports.timers === undefined ? {} : { timers: ports.timers }),
	});

	const cadenceController = createCadenceController({
		mode,
		intervals,
		pressure: serverPressure,
		now: nowMs,
		random,
		diagnostics,
		onStatusChange: scheduleStatusChange,
		gate: automaticTickGate,
		startedAtMs: engineStartedAtMs,
		isDisposed: () => disposed,
		laneIsArmable: (lane) =>
			lane !== 'query-total-retry' || maintenanceLanes.queryTotalRetry !== null,
		...(ports.lastUserActivityMs === undefined
			? {}
			: { lastUserActivityMs: ports.lastUserActivityMs }),
		...(ports.onUserActivity === undefined ? {} : { onUserActivity: ports.onUserActivity }),
		...(ports.timers === undefined ? {} : { timers: ports.timers }),
	});
	cadence = cadenceController;
	// Mounted product grids declare their exact filter/sort window at priority 700. The
	// unfiltered seed still runs on reconnect, rebaseline, manual sync, reset refill, and
	// the five-minute cadence to warm barcode local resolution in the background.
	const coldStartSeedLanes = SEED_RETICK_LANES.filter(
		(lane) => lane !== 'product-browse-window-seed'
	);
	if (mode === 'auto') {
		void ready.then(
			async () => {
				if (disposed) return;
				await Promise.all(coldStartSeedLanes.map((lane) => automaticTickGate.runLane(lane)));
				await automaticTickGate.runLane('scheduler-drain');
				if (disposed) return;
				cadenceController.start();
			},
			() => undefined
		);
	}

	function readStatus(): EngineStatus {
		let connectivityNow: EngineConnectivity;
		try {
			connectivityNow = connectivity();
		} catch (error) {
			connectivityNow = 'offline';
			diagnostics({
				type: 'engine.connectivity-error',
				level: 'error',
				message: `connectivity port threw: ${error instanceof Error ? error.message : String(error)}`,
			});
		}
		const stats = manager.stats();
		const laneStatus = (name: EngineLane, lastError: string | null) => ({
			lastError,
			lastTick: laneLastTick.get(name) ?? null,
			nextDueAtMs: cadenceController.nextDueAtMs(name),
		});
		return {
			disposed,
			mode,
			connectivity: connectivityNow,
			gatedBy:
				pendingLifecycleOps > 0
					? 'lifecycle'
					: connectivityNow === 'offline'
						? 'offline'
						: manager.activeScope !== null && bootstrapFailures.has(manager.activeScope)
							? 'bootstrap-failed'
							: null,
			bootstrapFailed: Object.fromEntries(bootstrapFailures),
			activeScopeId: disposed ? null : manager.activeScope,
			scopesOpen: stats.scopesOpen,
			guards: {
				wrongScopeWrites: stats.wrongScopeWrites,
				lateResponsesDropped: stats.lateResponsesDropped,
			},
			lanes: Object.fromEntries(
				LANE_REGISTRY.map(({ laneName, targetKey }) => [
					laneName,
					laneStatus(laneName, laneTargets[targetKey]?.lastError() ?? null),
				])
			) as EngineStatus['lanes'],
			queueDepth: writePlane.queueDepth(),
			collections: Object.fromEntries(
				SYNC_COLLECTION_NAMES.map((collection) => [
					collection,
					{
						active: (collectionActivity.get(collection) ?? 0) > 0,
						coverageGeneration: collectionCoverageGeneration.get(collection) ?? 0,
					},
				])
			) as Record<SyncCollectionName, EngineCollectionState>,
		};
	}

	return {
		ready,
		active: () => {
			if (disposed) return null;
			const scopeId = manager.activeScope;
			if (scopeId === null) return null;
			try {
				return activeScopeOf(scopeId);
			} catch {
				return null;
			}
		},
		hostTransport: () => hostTransport,
		reconfigure: (config) => cadenceController.reconfigure(config),
		db$: (cb) => {
			assertNotDisposed();
			dbSubscribers.add(cb);
			try {
				cb(activeDatabase());
			} catch {
				// Same contract as emitDb: a throwing listener never breaks the engine.
			}
			return () => {
				dbSubscribers.delete(cb);
			};
		},
		scope: {
			switch: async (identity) => switchScope(identity),
			resetCollection: async (name, opts) => {
				assertNotDisposed();
				if (!isResettableCollection(name)) {
					throw new Error(
						`Unknown collection "${name}" — resettable collections: ${[...SYNC_COLLECTION_NAMES, MUTATION_QUEUE_COLLECTION].join(', ')}`
					);
				}
				// The target scope resolves INSIDE the FIFO turn: a reset enqueued
				// behind a pending switch resets the scope that is active once that
				// switch settled — never the one it happened to race past.
				return enqueueLifecycle(async () => {
					const scopeId = manager.activeScope;
					if (scopeId === null) {
						throw new Error(
							'Cannot reset a collection: no active scope (did the initial open fail?)'
						);
					}
					const beforeDrop = opts?.beforeDrop;
					return manager.resetCollection(scopeId, name, {
						...(opts?.confirmDestroyQueue !== undefined
							? { confirmDestroyQueue: opts.confirmDestroyQueue }
							: {}),
						...(beforeDrop !== undefined
							? { beforeDrop: () => beforeDrop(activeScopeOf(scopeId)) }
							: {}),
					});
				});
			},
		},
		write: (intent) => writePlane.write(intent),
		conflicts: () => writePlane.conflicts(),
		resolveConflict: (mutationId, resolution) => writePlane.resolveConflict(mutationId, resolution),
		require: (requirement) => {
			assertNotDisposed();
			return requirePlane.require(requirement);
		},
		checkCollection: async (name, options) => {
			assertNotDisposed();
			const startedAt = nowMs();
			if (!(SYNC_COLLECTION_NAMES as readonly string[]).includes(name)) {
				throw new Error(`Unknown sync collection "${String(name)}"`);
			}
			await readySettledForSync;
			assertNotDisposed();
			if (pendingLifecycleOps > 0) {
				return {
					collection: name,
					status: 'skipped',
					reason: 'lifecycle operation pending',
				};
			}
			// The forced census rides the REGISTERED query-total-retry lane (per-tick
			// option), so status().lanes lastError, lane events, diagnostics, and the
			// census publish all flow through the same instrumentation as any tick.
			const censusReport = recordLaneTick(
				await tickLaneWithEvents('query-total-retry', options?.signal, (signal) =>
					maintenanceLanes.queryTotalRetry === null
						? Promise.resolve<SyncReport>({
								lane: 'query-total-retry',
								status: 'skipped',
								reason: 'no queryTotal port provided',
							})
						: maintenanceLanes.queryTotalRetry.tick(signal, { forceCensusCollection: name })
				),
				startedAt
			);
			const changeStartedAt = nowMs();
			const changeReport = recordLaneTick(
				await tickLaneWithEvents('change-signal', options?.signal),
				changeStartedAt
			);
			const reports = [censusReport, changeReport];
			const worst = reports.some((report) => report.status === 'error')
				? ('error' as const)
				: reports.some((report) => report.status === 'ran')
					? ('ran' as const)
					: ('skipped' as const);
			return {
				collection: name,
				status: worst,
				...(reports.find((report) => report.reason)?.reason
					? { reason: reports.find((report) => report.reason)!.reason }
					: {}),
				...(reports.find((report) => report.error)?.error
					? { error: reports.find((report) => report.error)!.error }
					: {}),
			};
		},
		sync: async (lane, options) => {
			assertNotDisposed();
			const startedAt = nowMs();
			const finish = (report: SyncReport): SyncReport => recordLaneTick(report, startedAt);
			if (lane !== undefined && !LANE_REGISTRY.some((entry) => entry.laneName === lane)) {
				throw new Error(`Unknown engine lane "${String(lane)}"`);
			}
			await readySettledForSync;
			assertNotDisposed();
			if (pendingLifecycleOps > 0) {
				// ADR invariant 3: sync() during a pending lifecycle op returns
				// skipped rather than racing the transition.
				return finish({
					lane: lane ?? 'all',
					status: 'skipped',
					reason: 'lifecycle operation pending',
				});
			}
			if (lane !== undefined) return finish(await tickLaneWithEvents(lane, options?.signal));
			// ADR 0018 all-lane tick order is stable: detection, write drain, then
			// maintenance in dependency order — SEEDS BEFORE the scheduler drain
			// (gate2 #516 item 6): the seeds only ENQUEUE persisted tasks, so a
			// manual sync() must run them first or it returns 'ran' with its own
			// just-seeded work still pending until some later tick.
			// Idle maintenance lanes do not run as a side effect of a manual full sync.
			// Their explicit single-lane forms remain valid.
			const reports: SyncReport[] = [];
			for (const name of MANUAL_SYNC_LANES) {
				const report = await tickLaneWithEvents(
					name,
					options?.signal,
					name === 'query-total-retry'
						? (signal) =>
								maintenanceLanes.queryTotalRetry === null
									? Promise.resolve<SyncReport>({
											lane: 'query-total-retry',
											status: 'skipped',
											reason: 'no queryTotal port provided',
										})
									: maintenanceLanes.queryTotalRetry.tick(signal, { forceAllCensus: true })
						: undefined
				);
				laneLastTick.set(name, {
					atMs: ports.now !== undefined ? ports.now() : Date.now(),
					status: report.status,
				});
				scheduleStatusChange();
				reports.push(report);
			}
			const drain = reports[1]!;
			const worst = reports.some((report) => report.status === 'error')
				? ('error' as const)
				: reports.some((report) => report.status === 'ran')
					? ('ran' as const)
					: ('skipped' as const);
			return finish({
				lane: 'all',
				status: worst,
				...(reports.find((report) => report.error)?.error
					? { error: reports.find((report) => report.error)!.error }
					: {}),
				...(reports.find((report) => report.reason)?.reason
					? { reason: reports.find((report) => report.reason)!.reason }
					: {}),
				...(drain.pushed !== undefined
					? {
							pushed: drain.pushed,
							held: drain.held,
							conflicts: drain.conflicts,
							deferred: drain.deferred,
							failed: drain.failed,
							rejected: drain.rejected,
						}
					: {}),
			});
		},
		events: (cb) => {
			assertNotDisposed();
			eventSubscribers.add(cb);
			return () => {
				eventSubscribers.delete(cb);
			};
		},
		statusChanges: (cb) => {
			assertNotDisposed();
			statusSubscribers.add(cb);
			try {
				cb(readStatus());
			} catch {
				// Same contract as db$: a throwing listener never breaks the engine.
			}
			return () => {
				statusSubscribers.delete(cb);
			};
		},
		censusChanges: (cb) => {
			assertNotDisposed();
			return censusPublisher.subscribe(cb);
		},
		coverageChanges: (target, cb) => {
			assertNotDisposed();
			return coverageChangeHub.subscribe(target, cb);
		},
		status: readStatus,
		dispose: async () => {
			assertNotDisposed();
			// Terminal from THIS instant: later calls reject at the door, while
			// lifecycle ops already queued ahead run to completion first (FIFO —
			// each sees the prior outcome), so dispose's turn sees every scope a
			// pending switch opened.
			disposed = true;
			// Detach from the cross-tab bridge synchronously (#1209): the host owns
			// the channel and may keep it for the successor engine, so a stale
			// subscription would fan a peer's outcome into a disposed instance's
			// subscribers.
			unsubscribeWriteOutcomeBridge?.();
			cancelPendingRebaselineAudit();
			for (const collection of SYNC_COLLECTION_NAMES) collectionActivity.set(collection, 0);
			cadenceController.stop();
			// Synchronous, unlike the census expiry timer below: these are live RxDB query
			// subscriptions, and the lifecycle turn that runs next CLOSES every scope database
			// under them. Dropping them here also makes publishing inert from this instant, so a
			// pending expiry timer can never hand a subscriber a verdict after dispose.
			coverageChangeHub.dispose();
			// A dispose before the initial open settles is deliberate teardown, not
			// a stall — stop the watchdog's reports.
			readinessWatchdog.stop();
			return enqueueLifecycle(async () => {
				// closeScope aborts the scope's in-flight signals and drains guarded
				// writes before closing. Loop until empty rather than snapshotting —
				// nothing can enqueue behind dispose, but the loop makes that
				// assumption unnecessary.
				while (databaseByScopeId.size > 0) {
					const [scopeId] = databaseByScopeId.keys();
					await manager.closeScope(scopeId);
				}
				emitDb(null);
				censusPublisher.dispose();
				dbSubscribers.clear();
				eventSubscribers.clear();
				// One synchronous, fully settled snapshot (disposed, ungated, zero
				// scopes) before the set clears — the queued microtask would fire
				// after the clear and monitors would never see the terminal state.
				{
					const finalStatus = readStatus();
					for (const cb of [...statusSubscribers]) {
						try {
							cb(finalStatus);
						} catch (error) {
							diagnostics({
								type: 'engine.listener-error',
								level: 'error',
								message: `statusChanges() listener threw during dispose: ${error instanceof Error ? error.message : String(error)}`,
							});
						}
					}
				}
				statusSubscribers.clear();
				diagnostics({
					type: 'engine.disposed',
					level: 'info',
					message: 'engine disposed; every scope database closed',
				});
			});
		},
	};
}
