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
 * `status().gatedBy`, diagnostics, and `onScopeEvent`.
 *
 * A scope's write plane has exactly one engine owner. This is a hard engine
 * contract: hosts that can mount multiple instances must leader-elect before
 * allowing `write()` or arming write/drain lanes. The engine's transact chain
 * is intentionally process-local; cross-instance election belongs to the
 * host boundary (Web Locks in the web host, host-native coordination elsewhere).
 *
 * Invariants carried here:
 *  1. Scope safety is unrepresentable — no ticket, epoch, or guarded-write
 *     type appears in this interface; capture lives behind the sync-core
 *     StoreScopeManager. Dropped work surfaces only as `guard` events +
 *     `status()` counters.
 *  2. Plain store switching preserves every scope's data, cursors, and
 *     mutation queue (pause/resume — the outgoing database stays open, and
 *     works offline). Only `resetCollection` clears the matching cursors, and
 *     the ENGINE does that clearing itself, atomically with the reset, via
 *     the manager's cursor invalidators. Resetting `'mutations'` with pending
 *     mutations returns 'needs-confirmation' and touches nothing without
 *     `confirmDestroyQueue`.
 *  3. Lifecycle ops serialize (the manager's promise-chain mutex); `dispose()`
 *     is terminal — further lifecycle calls reject.
 *  4. One engine instance owns a scope's write plane; multi-instance hosts
 *     must elect that owner before exposing writes or arming drains.
 *  5. Decisions the caller must make are values ('needs-confirmation');
 *     caller misuse is an exception (post-dispose call, unknown collection,
 *     cross-site identity — multi-site is a new engine).
 *
 * Host-facing projections stay deliberately small: `onScopeEvent()` maps the
 * lifecycle/guard subset both hosts otherwise translated independently, and
 * `stats()` projects the three shared scope/guard counters both hosts display. Raw
 * `events()` and full `status()` remain available for engine-specific UI.
 */

import {
	assertBulkSuccess,
	canonicalSiteKey,
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
import { COLLECTION_DESCRIPTORS, writeFacetFor } from './collections/collection-descriptors';
import {
	CHANGE_SIGNAL_STATE_KEY,
	createChangeSignalLane,
	zeroChangeSignalStateBlob,
} from './change-signal/change-signal-lane';
import {
	createWriteDrainLane,
	fetchOrderServerRevision,
	type WriteOutcomeEvent,
} from './write-path/write-drain-lane';
import {
	type CoverageOutcome,
	createRequirePlane,
	type EngineRequirement,
	type RequirementHandle,
} from './require-plane';
import { seedPosBootstrapLanes } from './scheduler/rx-pos-bootstrap-seeder';
import { seedTargetedOrderSchedulerTask } from './scheduler/rx-order-scheduler-task-seeder';
import {
	COVERAGE_COMPACTION_RETAIN_STALE_FOR_MS,
	createMaintenanceLanes,
	type MaintenanceLaneName,
	type QueryTotalCacheEvent,
	type QueryTotalPort,
} from './maintenance/maintenance-lanes';
import { ORDER_SCHEDULER_COVERAGE_FRESH_FOR_MS } from './scheduler/engine-scheduler-drain';
import {
	createLocalCoverage,
	type LocalCoverage,
	type ReconcileRequest,
} from './local-coverage/local-coverage';
import { enqueueWriteIntent, queueFor, type WriteIntent } from './write-path/write-intents';
import { EngineOrderRepository } from './write-path/engine-order-repository';
import { hasPendingLocalWork } from './write-path/local-work-guard';
import { CHANGE_SIGNAL_STATE_ID } from './change-signal/change-signal-state-schema';
import { pullTargetedByIds } from './change-signal/change-signal-handlers';
import {
	readManifestRange,
	removeManifestByWooIds,
	upsertManifestRows,
} from './local-coverage/rx-existence-manifest-repository';
import { orderDocumentFromWooPayload } from './scheduler/rx-scheduler-order-fetcher';
import { manifestRowOf } from './materialization/record-materialization';
import { WOO_REST_MAX_PER_PAGE } from './scheduler/order-browser-scheduler-descriptor';
import { chunk } from './scheduler/chunk';

export type { CoverageOutcome, EngineRequirement, RequirementHandle } from './require-plane';
export type {
	MaintenanceLaneName,
	MaintenanceLaneReport,
	QueryTotalPort,
	QueryTotalCacheEvent,
} from './maintenance/maintenance-lanes';
export type { WriteIntent } from './write-path/write-intents';

export type EngineLane = 'change-signal' | 'write-drain' | MaintenanceLaneName;

/** One deterministic tick's outcome. A full sync() (no lane) runs all nine
 * registered lanes in dependency order and reports their aggregate worst
 * status and write-drain counters. */
export type SyncReport = {
	lane: EngineLane | 'all';
	status: 'ran' | 'skipped' | 'error';
	reason?: string;
	error?: string;
	pushed?: number;
	conflicts?: number;
	deferred?: number;
	failed?: number;
	rejected?: number;
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

/** RAW transport, never pre-scoped — the engine binds scope tickets inside. */
export type EngineFetcher = (url: string, init?: RequestInit) => Promise<Response>;

/** Host-provided checkpoint persistence. Async-first so a collection-backed
 * store fits; a synchronous store (localStorage) wraps trivially. */
export type EngineStringStore = {
	get(key: string): Promise<string | null>;
	set(key: string, value: string): Promise<void>;
	remove(key: string): Promise<void>;
};

export type RxdbSyncEnginePorts = {
	site: { syncBaseUrl: string; wpJsonRoot: string };
	/** The ONLY required adapter port. A factory receives the full scope
	 * identity so per-scope storage decisions stay possible. */
	storage:
		| RxStorage<unknown, unknown>
		| ((identity: StoreScopeIdentity) => RxStorage<unknown, unknown>);
	/** Default: globalThis.fetch. Used by change-signal, scheduler, maintenance,
	 * conflict-resolution, and write-drain transport paths. */
	fetcher?: EngineFetcher;
	/** Default: the engine-owned kv collection INSIDE each scope db — a
	 * volatile database gets a volatile cursor for free. */
	checkpoints?: EngineStringStore;
	connectivity?: () => EngineConnectivity;
	/** Default: Web Crypto. Native hosts inject their UUID v4 generator. */
	uuid?: () => string;
	/** THE telemetry port (ADR 0020): structured SyncEvents, observed and never
	 * awaited; a throwing observer is swallowed. */
	diagnostics?: SyncObserver;
	/** 'auto' (default): all periodic lanes arm after `ready`. 'manual': no
	 * timers — callers drive deterministic ticks via sync(). */
	mode?: 'auto' | 'manual';
	/** RxDB multiInstance for the engine's scope databases (cross-tab change
	 * propagation via BroadcastChannel). Default false; a multi-tab host (the
	 * web app) passes true. Host adoption (#430): the create call is engine-
	 * internal, so this cannot be adapted outside the port. */
	multiInstance?: boolean;
	/** RxDB hashFunction for the engine's scope databases. Default: RxDB's
	 * (WebCrypto-based) sha256. Host adoption (#430 phase 3): Hermes/RN hosts
	 * have no crypto.subtle and back this with expo-crypto — the create call is
	 * engine-internal, so (like multiInstance) this cannot be adapted outside
	 * the port. */
	hashFunction?: HashFunction;
	intervals?: Partial<EngineIntervals>;
	/** Host-executed query-total fetch. The query-total retry lane arms ONLY
	 * when this port is provided (the engine cannot guess the host's total
	 * endpoint semantics). */
	queryTotal?: QueryTotalPort;
	now?: () => number;
};

export type EngineIntervals = {
	/** Change-signal poll cadence under mode:'auto'. Default 10s (the web host's). */
	changeSignalPollMs: number;
	/** Write-drain cadence under mode:'auto'. Default 10s (the web host's). */
	writeDrainPollMs: number;
	/** Persisted scheduler drain cadence. Default 30s (the web host's). */
	schedulerDrainMs: number;
	/** Orders open-recent window re-seed cadence. Default 5min (the web host's). */
	orderWindowSeedMs: number;
	/** Reference-lane (F11) re-seed cadence. Default 5min (the web host's). */
	referenceSeedMs: number;
	/** Query-total retry scan cadence (armed only with ports.queryTotal). Default 30s. */
	queryTotalRetryScanMs: number;
	/** Coverage compaction scan cadence. Default 60s (the web host's). */
	coverageCompactionScanMs: number;
	/** Existence-manifest prime cadence. Conservative backstop; default 15min. */
	existencePrimeMs: number;
	/** Existence anti-entropy reconcile cadence. Staggered from prime; default 17min. */
	existenceReconcileMs: number;
};

const DEFAULT_INTERVALS: EngineIntervals = {
	changeSignalPollMs: 10_000,
	writeDrainPollMs: 10_000,
	schedulerDrainMs: 30_000,
	orderWindowSeedMs: 5 * 60_000,
	referenceSeedMs: 5 * 60_000,
	queryTotalRetryScanMs: 30_000,
	coverageCompactionScanMs: 60_000,
	existencePrimeMs: 15 * 60_000,
	existenceReconcileMs: 17 * 60_000,
};

export type ActiveScope = {
	identity: StoreScopeIdentity;
	scopeId: string;
	database: RxDatabase;
};

/** Public event union — deliberately epoch-free (invariant 1). `detail` is
 * an opaque diagnostic string, never a contract. */
export type EngineEvent =
	| { type: 'scope-switched'; scopeId: string; from: string | null }
	| { type: 'collection-reset'; scopeId: string; collection: ResettableCollectionName }
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
	| { type: 'write-annihilated'; collection: string; recordId: string; mutationId: string }
	// Fresh query totals persisted by the retry lane (slice 5d) — the host
	// hydrates its UI caches from these.
	| QueryTotalCacheEvent
	| {
			type: 'write-conflict';
			collection: string;
			recordId: string;
			mutationId: string;
			currentRevision: string | null;
	  }
	| { type: 'write-rejected'; collection: string; recordId: string; mutationId: string };

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
		{ lastError: string | null; lastTick: { atMs: number; status: SyncReport['status'] } | null }
	>;
	bootstrapFailed: Record<string, string>;
	/** Pending mutation count of the active scope (cached from the last enqueue/drain; null before either). */
	queueDepth: number | null;
};

export type EngineScopeEvent =
	| { type: 'switched'; scopeId: string }
	| { type: 'reset'; scopeId: string; collection: ResettableCollectionName }
	| { type: 'needs-confirmation'; scopeId: string; detail?: string }
	| { type: 'write-dropped' | 'late-response-dropped'; scopeId: string; detail?: string }
	| { type: 'bootstrap-failed'; scopeId: string; detail: string };

export type EngineStats = Pick<EngineStatus, 'scopesOpen'> & EngineStatus['guards'];

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
	 * write facet (orders today) — anything else throws (invariant 5). */
	write(
		intent: WriteIntent
	): Promise<{ mutationId: string; recordId: string; annihilated?: boolean }>;
	/**
	 * The terminal write entries awaiting an explicit caller decision — there
	 * is NO auto-resolution. 'conflicted' rows (a 409 stale-revision push) carry
	 * the server's truth from the 409 (`conflictDocument` + `conflictRevision`);
	 * 'needs-revision' rows (an unrecoverable 428 — the server demands a
	 * precondition and no current revision could be determined) carry NO server
	 * truth: `resolveConflict('retry-with-server-base')` FIRST refreshes the
	 * revision from the server; 'rejected' rows are permanent-4xx dead letters
	 * whose only resolution is 'discard'. Rows persist here until
	 * `resolveConflict` settles them.
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
	 *  - 'discard': the server-truth re-pull is queued DURABLY (a persisted
	 *    targeted scheduler task, orders with a known Woo id) BEFORE the
	 *    mutation is removed and the record's pendingMutationIds/dirty
	 *    bookkeeping clears — so a crash or a failed fetch can never leave the
	 *    local record silently posing as synced with the re-pull lost. An
	 *    immediate completion is attempted; if it cannot complete now, the
	 *    durable task self-heals on a later scheduler-drain tick (surfaced as a
	 *    `queue.write.discard-repull-deferred` diagnostics event).
	 * Throws for an unknown/non-terminal mutationId, or retry on a rejected row.
	 */
	resolveConflict(
		mutationId: string,
		resolution: 'retry-with-server-base' | 'discard'
	): Promise<void>;
	/** Component-declared data requirement (CONTEXT.md): coverage-aware ready
	 * (serve-local without a fetch when every record is resident), priority
	 * preemption over queued demand work, release() demotion. */
	require(requirement: EngineRequirement): RequirementHandle;
	/** One deterministic guarded tick of the named lane. When omitted, runs
	 * every registered lane in documented dependency order. Never throws for
	 * periodic-class failures — a failed tick reports { status: 'error' } and
	 * self-heals next tick (invariant 5); post-dispose calls reject. */
	sync(lane?: EngineLane, options?: { signal?: AbortSignal }): Promise<SyncReport>;
	events(cb: (e: EngineEvent) => void): Unsubscribe;
	/** Host view projection of scope lifecycle and guard events. */
	onScopeEvent(cb: (event: EngineScopeEvent) => void): Unsubscribe;
	status(): EngineStatus;
	/** Host view projection of the shared scope/guard counters. */
	stats(): EngineStats;
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
	const diagnostics: SyncObserver = (event) => {
		try {
			ports.diagnostics?.(event);
		} catch {
			// The observer seam must never throw into the engine (ADR 0018).
		}
	};
	const fetcher: EngineFetcher = ports.fetcher ?? ((url, init) => globalThis.fetch(url, init));
	const uuid = ports.uuid ?? webCryptoUuid;
	const initialSiteKey = canonicalSiteKey(initialScope.site);

	const identityByScopeId = new Map<string, StoreScopeIdentity>();
	const databaseByScopeId = new Map<string, RxDatabase>();
	const localCoverageByScopeId = new Map<string, LocalCoverage>();
	const dbSubscribers = new Set<(db: RxDatabase | null) => void>();
	const eventSubscribers = new Set<(e: EngineEvent) => void>();
	const scopeEventSubscribers = new Set<(e: EngineScopeEvent) => void>();
	let disposed = false;
	let announcedScopeId: string | null = null;
	const bootstrappedScopes = new Set<string>();
	const bootstrapFailures = new Map<string, string>();
	const laneLastTick = new Map<EngineLane, { atMs: number; status: SyncReport['status'] }>();

	const openScopeDatabase = async (scopeId: string): Promise<ScopeDatabase> => {
		const identity = identityByScopeId.get(scopeId);
		if (!identity) {
			throw new Error(`No identity registered for scope ${scopeId}`);
		}
		const storage = typeof ports.storage === 'function' ? ports.storage(identity) : ports.storage;
		const db = await createRxDatabase({
			name: scopeDatabaseName(identity),
			storage,
			// Cross-tab change propagation is the HOST's call (ports.multiInstance,
			// #430): the web app runs multi-tab and passes true; harnesses and
			// single-window hosts keep the single-instance default.
			multiInstance: ports.multiInstance ?? false,
			...(ports.hashFunction !== undefined ? { hashFunction: ports.hashFunction } : {}),
		});
		try {
			await db.addCollections(engineCollectionCreators() as never);
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
		databaseByScopeId.set(scopeId, db);
		const targeted = Object.fromEntries(
			COLLECTION_DESCRIPTORS.filter((descriptor) => descriptor.shape === 'targeted').map(
				(descriptor) => [descriptor.collection, descriptor]
			)
		) as Record<
			'products' | 'variations' | 'customers',
			Extract<(typeof COLLECTION_DESCRIPTORS)[number], { shape: 'targeted' }>
		>;
		const handlerContext = {
			database: db,
			fetch: fetcher,
			syncBaseUrl: ports.site.syncBaseUrl,
			persistState: async () => undefined,
			log: () => undefined,
		};
		const reconcilePort = (
			manifestName: 'existenceManifest' | 'existenceManifestCustomers' | 'existenceManifestOrders',
			collection: 'products' | 'customers' | 'orders'
		) => {
			const manifest = db.collections[manifestName] as never;
			const collectionParam = collection === 'products' ? '' : `&collection=${collection}`;
			const sourceCollections =
				collection === 'products' ? (['products', 'variations'] as const) : ([collection] as const);
			const dirtyWooIds = async (): Promise<Set<number>> => {
				const ids = new Set<number>();
				for (const name of sourceCollections) {
					const docs = await db.collections[name].find().exec();
					for (const doc of docs) {
						const row = doc.toJSON() as {
							wooProductId?: number;
							wooId?: number;
							wooCustomerId?: number;
							wooOrderId?: number;
							local?: { dirty?: boolean; pendingMutationIds?: unknown[] };
						};
						if (!row.local?.dirty && !row.local?.pendingMutationIds?.length) continue;
						const wooId = row.wooProductId ?? row.wooId ?? row.wooCustomerId ?? row.wooOrderId;
						if (typeof wooId === 'number') ids.add(wooId);
					}
				}
				return ids;
			};
			const removeTargeted = async (
				name: 'products' | 'variations' | 'customers',
				field: string,
				wooIds: number[]
			) => {
				const docs = await db.collections[name]
					.find({ selector: { [field]: { $in: wooIds } } as never })
					.exec();
				const protectedWooIds = new Set<number>();
				const removable = docs.filter((doc) => {
					const row = doc.toJSON() as Record<string, unknown>;
					if (!hasPendingLocalWork(row)) return true;
					const wooId = row[field];
					if (typeof wooId === 'number') protectedWooIds.add(wooId);
					return false;
				});
				if (removable.length > 0)
					assertBulkSuccess(
						await db.collections[name].bulkRemove(removable.map((doc) => doc.primary)),
						'create-rxdb-sync-engine remove'
					);
				await removeManifestByWooIds(
					manifest,
					wooIds.filter((wooId) => !protectedWooIds.has(wooId))
				);
			};
			const pullTargetedAndPopulateManifest = async (
				descriptor: (typeof targeted)[keyof typeof targeted],
				wooIds: number[],
				request?: ReconcileRequest
			) =>
				pullTargetedByIds(
					{ ...handlerContext, fetch: request?.fetcher ?? fetcher },
					descriptor,
					wooIds,
					async (documents) => {
						const manifestRows = documents.flatMap((document) =>
							manifestRowOf(document) ? [manifestRowOf(document)!] : []
						);
						assertBulkSuccess(
							await db.collections[descriptor.collection].bulkUpsert(documents as never[]),
							'create-rxdb-sync-engine upsert'
						);
						if (manifestRows.length > 0) await upsertManifestRows(manifest, manifestRows);
					}
				);
			return {
				bucketSize: 1000,
				maxWooId: async () => {
					const docs = await db.collections[manifestName].find().exec();
					return docs.reduce(
						(max, doc) => Math.max(max, Number((doc.toJSON() as { wooId?: unknown }).wooId) || 0),
						0
					);
				},
				readManifestRange: (lo: number, hi: number) => readManifestRange(manifest, lo, hi),
				dirtyWooIds,
				fetchServerBucket: async (
					bucket: number,
					bucketSize: number,
					request?: ReconcileRequest
				) => {
					const response = await (request?.fetcher ?? fetcher)(
						`${ports.site.syncBaseUrl}/integrity/bucket?bucket=${bucket}&bucket_size=${bucketSize}${collectionParam}`,
						request?.signal ? { signal: request.signal } : undefined
					);
					if (!response.ok) throw new Error(`existence bucket fetch failed: ${response.status}`);
					const body = (await response.json()) as {
						ids?: { id: number; digest: string; object_type?: string }[];
					};
					return (body.ids ?? []).map((row) => ({
						id: row.id,
						digest: row.digest,
						objectType: (row.object_type ??
							(collection === 'orders'
								? 'order'
								: collection === 'customers'
									? 'customer'
									: 'product')) as 'product' | 'variation' | 'customer' | 'order',
					}));
				},
				deleteProducts: async (wooIds: number[]) => {
					if (collection === 'orders')
						return new EngineOrderRepository(db.collections as never).removeDeletedOrders(wooIds);
					return removeTargeted(
						collection,
						collection === 'products' ? 'wooProductId' : 'wooCustomerId',
						wooIds
					);
				},
				deleteVariations: (wooIds: number[]) => removeTargeted('variations', 'wooId', wooIds),
				pullProducts: async (wooIds: number[], request?: ReconcileRequest) => {
					if (collection === 'orders') {
						for (const batch of chunk(wooIds, WOO_REST_MAX_PER_PAGE)) {
							const response = await (request?.fetcher ?? fetcher)(
								`${ports.site.syncBaseUrl}/orders?include=${batch.join(',')}&per_page=${batch.length}&orderby=include`,
								request?.signal ? { signal: request.signal } : undefined
							);
							if (!response.ok) throw new Error(`order existence pull failed: ${response.status}`);
							const payloads = (await response.json()) as Record<string, unknown>[];
							const payloadByWooId = new Map(
								payloads.map((payload) => [Number(payload.id), payload])
							);
							const existingPayloads = batch.flatMap((wooId) => {
								const payload = payloadByWooId.get(wooId);
								return payload ? [payload] : [];
							});
							await new EngineOrderRepository(db.collections as never).upsertMany(
								existingPayloads.map((payload) => orderDocumentFromWooPayload(payload))
							);
						}
						return;
					}
					await pullTargetedAndPopulateManifest(targeted[collection], wooIds, request);
				},
				pullVariations: async (wooIds: number[], request?: ReconcileRequest) => {
					await pullTargetedAndPopulateManifest(targeted.variations, wooIds, request);
				},
			};
		};
		localCoverageByScopeId.set(
			scopeId,
			createLocalCoverage({
				database: db as never,
				manifest: {
					fetcher: (url, init) => fetcher(url, init?.signal ? { signal: init.signal } : undefined),
					syncBaseUrl: ports.site.syncBaseUrl,
				},
				reconcile: [
					reconcilePort('existenceManifest', 'products'),
					reconcilePort('existenceManifestCustomers', 'customers'),
					reconcilePort('existenceManifestOrders', 'orders'),
				],
				freshForMs: ORDER_SCHEDULER_COVERAGE_FRESH_FOR_MS,
				retainStaleForMs: COVERAGE_COMPACTION_RETAIN_STALE_FOR_MS,
				diagnostics,
				...(ports.now !== undefined ? { now: ports.now } : {}),
			})
		);
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

	// Invariant 2: the engine itself owns cursor clearing, registered once per
	// syncable collection, run by the manager INSIDE the serialized reset —
	// after feeders stop, before the drop. No host wires cursor clears. The
	// change-signal lane registers its own invalidators below (its unified
	// cursor spans collections, so ANY hybrid collection's reset prunes the
	// in-memory engine and clears the persisted blob — a zeroed cursor over
	// intact data merely re-pulls; a stale cursor over an emptied collection
	// silently skips records).
	for (const collection of SYNC_COLLECTION_NAMES) {
		manager.registerCursorInvalidator(collection, (scopeId) =>
			removeCheckpoint(scopeId, collection)
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
	registerManifestInvalidator('variations', 'existenceManifest', 'variation');
	registerManifestInvalidator('customers', 'existenceManifestCustomers', 'customer');
	registerManifestInvalidator('orders', 'existenceManifestOrders', 'order');

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
		const scopeEvent: EngineScopeEvent | null = (() => {
			switch (event.type) {
				case 'scope-switched':
					return { type: 'switched', scopeId: event.scopeId };
				case 'collection-reset':
					return { type: 'reset', scopeId: event.scopeId, collection: event.collection };
				case 'reset-needs-confirmation':
					return {
						type: 'needs-confirmation',
						scopeId: event.scopeId,
						...(event.detail !== undefined ? { detail: event.detail } : {}),
					};
				case 'guard':
					return {
						type: event.kind,
						scopeId: event.scopeId,
						...(event.detail !== undefined ? { detail: event.detail } : {}),
					};
				case 'bootstrap-failed':
					return { type: 'bootstrap-failed', scopeId: event.scopeId, detail: event.detail };
				default:
					return null;
			}
		})();
		if (scopeEvent) {
			for (const subscriber of [...scopeEventSubscribers]) {
				try {
					subscriber(scopeEvent);
				} catch {
					/* observer seam never throws into the engine */
				}
			}
		}
	};

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
	};

	const activeDatabase = (): RxDatabase | null => {
		const scopeId = manager.activeScope;
		return scopeId === null ? null : (databaseByScopeId.get(scopeId) ?? null);
	};

	manager.onEvent((event: ScopeEvent) => {
		switch (event.type) {
			case 'switched': {
				const from = announcedScopeId;
				announcedScopeId = event.scopeId;
				emitEngineEvent({ type: 'scope-switched', scopeId: event.scopeId, from });
				emitDb(activeDatabase());
				return;
			}
			case 'reset': {
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
		return { identity, scopeId, database };
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
	const enqueueLifecycle = <T>(task: () => Promise<T>): Promise<T> => {
		pendingLifecycleOps += 1;
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
			},
			() => {
				pendingLifecycleOps -= 1;
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
		const scopeId = scopeKeyFor(identity);
		identityByScopeId.set(scopeId, identity);
		return enqueueLifecycle(async () => {
			await manager.switchTo(scopeId);
			if (!bootstrappedScopes.has(scopeId)) {
				const database = databaseByScopeId.get(scopeId);
				if (!database) throw new Error(`Scope ${scopeId} opened without a database`);
				try {
					await seedPosBootstrapLanes({
						getRepository: async () => ({ getDatabase: () => database as never }),
						...(ports.now !== undefined ? { nowMs: ports.now() } : {}),
					});
					bootstrappedScopes.add(scopeId);
					bootstrapFailures.delete(scopeId);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					bootstrapFailures.set(scopeId, message);
					diagnostics({
						type: 'engine.pos-bootstrap-error',
						level: 'warn',
						message: `POS bootstrap seed failed: ${message}`,
						fields: { scopeId },
					});
					emitEngineEvent({ type: 'bootstrap-failed', scopeId, detail: message });
				}
			}
			diagnostics({
				type: 'engine.scope-switched',
				level: 'info',
				message: `active scope: ${scopeId}`,
			});
			return activeScopeOf(scopeId);
		});
	};

	// --- The change-signal lane (slice 3) --------------------------------------
	const intervals: EngineIntervals = { ...DEFAULT_INTERVALS, ...ports.intervals };
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
		...(ports.now !== undefined ? { now: ports.now } : {}),
	});
	const writeDrainLane = createWriteDrainLane({
		manager,
		databaseFor: (scopeId) => databaseByScopeId.get(scopeId) ?? null,
		fetcher,
		wpJsonRoot: ports.site.wpJsonRoot,
		syncBaseUrl: ports.site.syncBaseUrl,
		connectivity: () => {
			try {
				return connectivity();
			} catch {
				return 'offline';
			}
		},
		diagnostics,
		emitWriteEvent: (event: WriteOutcomeEvent) => emitEngineEvent(event),
		...(ports.now !== undefined ? { now: ports.now } : {}),
	});

	const requirePlane = createRequirePlane({
		// Lazy: readySettledForSync is created after `ready` below; requirements
		// enqueued before then await the settled initial open, never 'no active scope'.
		awaitReady: () => readySettledForSync,
		manager,
		databaseFor: (scopeId) => databaseByScopeId.get(scopeId) ?? null,
		coverageFor: (scopeId) => localCoverageByScopeId.get(scopeId) ?? null,
		fetcher,
		syncBaseUrl: ports.site.syncBaseUrl,
		diagnostics,
		...(ports.now !== undefined ? { now: ports.now } : {}),
	});

	// --- The maintenance lanes (slice 5d) --------------------------------------
	let maintenanceOwnerId: string | null = null;
	const maintenanceLanes = createMaintenanceLanes({
		manager,
		databaseFor: (scopeId) => databaseByScopeId.get(scopeId) ?? null,
		coverageFor: (scopeId) => localCoverageByScopeId.get(scopeId) ?? null,
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
		ownerId: () => (maintenanceOwnerId ??= `engine-${uuid()}`),
		...(ports.queryTotal !== undefined ? { queryTotal: ports.queryTotal } : {}),
		emitEvent: (event: QueryTotalCacheEvent) => emitEngineEvent(event),
		...(ports.now !== undefined ? { now: ports.now } : {}),
	});

	// The unified change-signal cursor spans every hybrid collection: resetting
	// ANY of them prunes the in-memory engine AND clears the persisted blob,
	// inside the manager's serialized reset (invariant 2). Orders are
	// local-only — no change-signal cursor to invalidate.
	for (const descriptor of COLLECTION_DESCRIPTORS) {
		if (descriptor.shape === 'local-only') continue;
		manager.registerCursorInvalidator(descriptor.collection, async (scopeId) => {
			changeSignalLane.prune(scopeId);
			// Rewind to ZERO, never delete: a deleted blob reads as "brand-new
			// scope" and primes to head — skipping exactly the historical rows the
			// just-dropped collection needs to refill.
			await writeBlob(scopeId, CHANGE_SIGNAL_STATE_KEY, zeroChangeSignalStateBlob());
		});
	}

	// The orders scheduler fetcher's custom-pull checkpoint (+ F8 epoch) lives
	// in the scope's syncCheckpoints collection (slice 5e), NOT the engine kv
	// store — an orders reset must rewind it too, or the persisted drain
	// resumes a stale cursor over the emptied collection (the web host's
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

	// mode:'auto' arms the poll AFTER the initial scope opened; a tick that
	// finds the engine gated (offline / mid-lifecycle) reports skipped and the
	// next interval retries — periodic errors land on diagnostics, never throw.
	let changeSignalTimer: ReturnType<typeof setInterval> | null = null;
	let writeDrainTimer: ReturnType<typeof setInterval> | null = null;
	const maintenanceTimers: ReturnType<typeof setInterval>[] = [];
	const runAutomaticTick = async (tick: () => Promise<SyncReport>): Promise<void> => {
		if (pendingLifecycleOps > 0) return;
		const startedAt = ports.now !== undefined ? ports.now() : Date.now();
		const report = await tick();
		if (report.lane !== 'all')
			laneLastTick.set(report.lane, {
				atMs: ports.now !== undefined ? ports.now() : Date.now(),
				status: report.status,
			});
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
							conflicts: report.conflicts ?? 0,
							deferred: report.deferred ?? 0,
							failed: report.failed ?? 0,
							rejected: report.rejected ?? 0,
						}
					: {}),
				durationMs: (ports.now !== undefined ? ports.now() : Date.now()) - startedAt,
			},
		});
	};
	if (mode === 'auto') {
		void ready.then(
			() => {
				if (disposed) return;
				changeSignalTimer = setInterval(() => {
					void runAutomaticTick(() => changeSignalLane.tick());
				}, intervals.changeSignalPollMs);
				writeDrainTimer = setInterval(() => {
					void runAutomaticTick(() => writeDrainLane.tick());
				}, intervals.writeDrainPollMs);
				maintenanceTimers.push(
					setInterval(() => {
						void runAutomaticTick(() => maintenanceLanes.schedulerDrain.tick());
					}, intervals.schedulerDrainMs)
				);
				maintenanceTimers.push(
					setInterval(() => {
						void runAutomaticTick(() => maintenanceLanes.orderWindowSeed.tick());
					}, intervals.orderWindowSeedMs)
				);
				maintenanceTimers.push(
					setInterval(() => {
						void runAutomaticTick(() => maintenanceLanes.referenceSeed.tick());
					}, intervals.referenceSeedMs)
				);
				if (maintenanceLanes.queryTotalRetry !== null) {
					const queryTotalRetry = maintenanceLanes.queryTotalRetry;
					void runAutomaticTick(() => queryTotalRetry.tick());
					maintenanceTimers.push(
						setInterval(() => {
							void runAutomaticTick(() => queryTotalRetry.tick());
						}, intervals.queryTotalRetryScanMs)
					);
				}
				maintenanceTimers.push(
					setInterval(() => {
						void runAutomaticTick(() => maintenanceLanes.coverageCompaction.tick());
					}, intervals.coverageCompactionScanMs)
				);
				maintenanceTimers.push(
					setInterval(() => {
						void runAutomaticTick(() => maintenanceLanes.existencePrime.tick());
					}, intervals.existencePrimeMs)
				);
				maintenanceTimers.push(
					setInterval(() => {
						void runAutomaticTick(() => maintenanceLanes.existenceReconcile.tick());
					}, intervals.existenceReconcileMs)
				);
			},
			() => undefined
		);
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
		write: async (intent) => {
			assertNotDisposed();
			if (!writeFacetFor(intent.collection)) {
				throw new Error(
					`write: collection "${intent.collection}" is not client-writeable (no push/ack contract) — writeable collections: orders, products, variations, customers, coupons`
				);
			}
			await readySettledForSync;
			assertNotDisposed();
			// Invariant 3's write() half: a pending switch/reset must settle before
			// the enqueue captures a scope — otherwise the mutation could land in
			// the OUTGOING store's queue mid-transition. FIFO ops are quick; wait
			// them out rather than reject a caller-initiated durable write.
			while (pendingLifecycleOps > 0) {
				await lifecycleChain;
				assertNotDisposed();
			}
			// The enqueue is a LOCAL write into the active scope's queue — scope-
			// guarded like every other write: racing a switch/reset drops it and
			// the caller retries against the settled scope (an exception, not a
			// silent enqueue into the wrong store).
			return manager.runGuarded(async (bound) => {
				const database = databaseByScopeId.get(bound.scopeId);
				if (!database) throw new Error('write: scope database not open');
				let result: { mutationId: string; recordId: string; annihilated?: boolean } | null = null;
				const wrote = await bound.guardWrite(async () => {
					result = await enqueueWriteIntent({
						db: database,
						intent,
						mintUuid: uuid,
						now: () => new Date(ports.now !== undefined ? ports.now() : Date.now()).toISOString(),
						observe: diagnostics,
					});
					writeDrainLane.noteQueueDepth((await queueFor(database).pending()).length);
				});
				if (wrote === 'dropped' || result === null) {
					throw new Error('write: scope moved during enqueue — retry against the settled scope');
				}
				const enqueueResult = result as {
					mutationId: string;
					recordId: string;
					annihilated?: boolean;
				};
				if (enqueueResult.annihilated) {
					// The honest terminal contract (gate2 #516 item 3): the delete was
					// satisfied locally (chain cancelled, resident row removed) — ONE
					// terminal event for the receipt mutationId, and no 'enqueued'
					// diagnostics (nothing was enqueued).
					emitEngineEvent({
						type: 'write-annihilated',
						collection: intent.collection,
						recordId: enqueueResult.recordId,
						mutationId: enqueueResult.mutationId,
					});
					return enqueueResult;
				}
				diagnostics({
					type: 'queue.write.enqueued',
					level: 'info',
					collection: intent.collection,
					fields: {
						mutationId: enqueueResult.mutationId,
						recordId: enqueueResult.recordId,
						queueDepth: writeDrainLane.lastKnownQueueDepth(),
					},
				});
				return enqueueResult;
			});
		},
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
		resolveConflict: async (mutationId, resolution) => {
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
				if (resolution === 'retry-with-server-base' && entry.status === 'rejected') {
					throw new Error('resolveConflict: rejected mutations can only be discarded');
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
								wpJsonRoot: ports.site.wpJsonRoot,
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
								getRepository: async () => ({ getDatabase: () => database as never }),
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
			}
		},
		require: (requirement) => {
			assertNotDisposed();
			return requirePlane.require(requirement);
		},
		sync: async (lane, options) => {
			assertNotDisposed();
			const startedAt = ports.now !== undefined ? ports.now() : Date.now();
			const finish = (report: SyncReport): SyncReport => {
				if (report.lane !== 'all')
					laneLastTick.set(report.lane, {
						atMs: ports.now !== undefined ? ports.now() : Date.now(),
						status: report.status,
					});
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
									conflicts: report.conflicts ?? 0,
									deferred: report.deferred ?? 0,
									failed: report.failed ?? 0,
									rejected: report.rejected ?? 0,
								}
							: {}),
						durationMs: (ports.now !== undefined ? ports.now() : Date.now()) - startedAt,
					},
				});
				return report;
			};
			const MAINTENANCE_LANES: Record<
				MaintenanceLaneName,
				(signal?: AbortSignal) => Promise<SyncReport>
			> = {
				'scheduler-drain': (signal) => maintenanceLanes.schedulerDrain.tick(signal),
				'order-window-seed': (signal) => maintenanceLanes.orderWindowSeed.tick(signal),
				'reference-seed': (signal) => maintenanceLanes.referenceSeed.tick(signal),
				'query-total-retry': async (signal) =>
					maintenanceLanes.queryTotalRetry !== null
						? maintenanceLanes.queryTotalRetry.tick(signal)
						: {
								lane: 'query-total-retry',
								status: 'skipped',
								reason: 'no queryTotal port provided',
							},
				'coverage-compaction': (signal) => maintenanceLanes.coverageCompaction.tick(signal),
				'existence-prime': (signal) => maintenanceLanes.existencePrime.tick(signal),
				'existence-reconcile': (signal) => maintenanceLanes.existenceReconcile.tick(signal),
			};
			if (
				lane !== undefined &&
				lane !== 'change-signal' &&
				lane !== 'write-drain' &&
				!(lane in MAINTENANCE_LANES)
			) {
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
			if (lane === 'change-signal') return finish(await changeSignalLane.tick(options?.signal));
			if (lane === 'write-drain') return finish(await writeDrainLane.tick(options?.signal));
			if (lane !== undefined) return finish(await MAINTENANCE_LANES[lane](options?.signal));
			// ADR 0018 all-lane tick order is stable: detection, write drain, then
			// maintenance in dependency order — SEEDS BEFORE the scheduler drain
			// (gate2 #516 item 6): the seeds only ENQUEUE persisted tasks, so a
			// manual sync() must run them first or it returns 'ran' with its own
			// just-seeded work still pending until some later tick.
			const ordered: EngineLane[] = [
				'change-signal',
				'write-drain',
				'order-window-seed',
				'reference-seed',
				'scheduler-drain',
				'query-total-retry',
				'coverage-compaction',
				'existence-prime',
				'existence-reconcile',
			];
			const reports: SyncReport[] = [];
			for (const name of ordered) {
				const report =
					name === 'change-signal'
						? await changeSignalLane.tick(options?.signal)
						: name === 'write-drain'
							? await writeDrainLane.tick(options?.signal)
							: await MAINTENANCE_LANES[name](options?.signal);
				laneLastTick.set(name, {
					atMs: ports.now !== undefined ? ports.now() : Date.now(),
					status: report.status,
				});
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
		onScopeEvent: (cb) => {
			assertNotDisposed();
			scopeEventSubscribers.add(cb);
			return () => {
				scopeEventSubscribers.delete(cb);
			};
		},
		stats: () => {
			const stats = manager.stats();
			return {
				scopesOpen: stats.scopesOpen,
				wrongScopeWrites: stats.wrongScopeWrites,
				lateResponsesDropped: stats.lateResponsesDropped,
			};
		},
		status: () => {
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
				lanes: {
					// Key order mirrors the documented all-lane sync() order (seeds
					// before the scheduler drain — #516 item 6).
					'change-signal': laneStatus('change-signal', changeSignalLane.lastError()),
					'write-drain': laneStatus('write-drain', writeDrainLane.lastError()),
					'order-window-seed': laneStatus(
						'order-window-seed',
						maintenanceLanes.orderWindowSeed.lastError()
					),
					'reference-seed': laneStatus(
						'reference-seed',
						maintenanceLanes.referenceSeed.lastError()
					),
					'scheduler-drain': laneStatus(
						'scheduler-drain',
						maintenanceLanes.schedulerDrain.lastError()
					),
					'query-total-retry': laneStatus(
						'query-total-retry',
						maintenanceLanes.queryTotalRetry?.lastError() ?? null
					),
					'coverage-compaction': laneStatus(
						'coverage-compaction',
						maintenanceLanes.coverageCompaction.lastError()
					),
					'existence-prime': laneStatus(
						'existence-prime',
						maintenanceLanes.existencePrime.lastError()
					),
					'existence-reconcile': laneStatus(
						'existence-reconcile',
						maintenanceLanes.existenceReconcile.lastError()
					),
				},
				queueDepth: writeDrainLane.lastKnownQueueDepth(),
			};
		},
		dispose: async () => {
			assertNotDisposed();
			// Terminal from THIS instant: later calls reject at the door, while
			// lifecycle ops already queued ahead run to completion first (FIFO —
			// each sees the prior outcome), so dispose's turn sees every scope a
			// pending switch opened.
			disposed = true;
			if (changeSignalTimer !== null) {
				clearInterval(changeSignalTimer);
				changeSignalTimer = null;
			}
			if (writeDrainTimer !== null) {
				clearInterval(writeDrainTimer);
				writeDrainTimer = null;
			}
			for (const timer of maintenanceTimers.splice(0)) {
				clearInterval(timer);
			}
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
				dbSubscribers.clear();
				eventSubscribers.clear();
				scopeEventSubscribers.clear();
				diagnostics({
					type: 'engine.disposed',
					level: 'info',
					message: 'engine disposed; every scope database closed',
				});
			});
		},
	};
}
