/**
 * The engine's maintenance lanes (slice 5d, #430 phase 1): the four
 * registry-free loops the web host previously assembled in mountWebSyncHost
 * (lanes 4–7) run inside the engine —
 *
 *  - ORDER OPEN-RECENT WINDOW SEED: orders aren't covered by the change
 *    signal, so the open/recent window is re-seeded on an interval (windowed
 *    lane, one bounded fetch — never a bulk pull; guardrail G3).
 *  - PRODUCT BROWSE-WINDOW SEED (ADR 0027 §2): so a cold grid shows products
 *    without a search, a bounded result window by the POS default catalog sort
 *    is re-seeded on an interval (windowed lane, never a bulk pull; guardrail
 *    G3). Below the reference lanes and the orders window. The window is a ROW
 *    COUNT; the wire page size is the Performance dial (#908), so the seed is
 *    several polite requests, not one 100-record one.
 *  - REFERENCE RE-SEED (F11): a completed greedy task is terminal, so a
 *    mid-session category/brand/tag/coupon edit never reaches a running POS
 *    without a periodic re-seed → re-pull → set-difference prune.
 *  - QUERY-TOTAL RETRY SCAN: drains persisted query-total request states
 *    through the host's fetchWooQueryTotal port. Armed ONLY when the port is
 *    provided; fresh cache entries surface as a 'query-total-cache' engine
 *    event so the host can hydrate its UI caches.
 *  - COVERAGE COMPACTION: lease-guarded expiry compaction of the coverage
 *    store, with per-scope lastCompactedAt tracking.
 *
 * Same tick contract as the change-signal/write-drain lanes: offline or
 * mid-lifecycle → skipped; scope-guarded body; errors land on diagnostics and
 * the report, never throw. The persisted scheduler DRAIN (which needs the
 * per-scope fetcher registry) is slice 5e — these lanes only SEED or operate
 * on engine-owned state.
 */

import { REFERENCE_COLLECTIONS } from '@wcpos/sync-core';
import type { StoreScopeManager, SyncObserver } from '@wcpos/sync-core';

import {
	censusCollectionFromQueryKey,
	censusQueryKey,
	type CensusTotal,
	type CensusTotals,
	PRODUCT_BROWSE_WINDOW_LIMIT,
	QUERY_TOTAL_FRESH_FOR_MS,
	QUERY_TOTAL_LEASE_FOR_MS,
	QUERY_TOTAL_RETRY_AFTER_MS,
	type QueryTotalCacheEntry,
	type QueryTotalRequestState,
	type QueryTotalWooRequest,
	runEngineSchedulerDrain,
	type SchedulerDrainDatabase,
	seedOrderFilterSchedulerTask,
	type SeedPersistedSchedulerTasksResult,
	seedProductBrowseWindowSchedulerTask,
	seedReferenceLanes,
	SUPPORTED_CENSUS_COLLECTIONS,
} from '../scheduler';
import { runQueryTotalRetryRequests } from '../rx-query-total-retry-runner';
import { RxQueryTotalRequestStateRepository } from '../rx-query-total-request-state-repository';
import { RxQueryTotalCacheRepository } from '../collections/rx-query-total-cache-repository';
import { withLedgerRecovery } from '../local-coverage/ledger-storage-recovery';
import { type CustomerTrickleStateStore, tickCustomerTrickle } from './customer-trickle';
import { type ProductTrickleStateStore, tickProductTrickle } from './product-trickle';
import { tickVariationPrefetch, type VariationPrefetchStateStore } from './variation-prefetch';
import {
	laneRegistryEntry,
	type MaintenanceLaneName,
	type MaintenanceLaneRegistryEntry,
} from './lane-registry';

import type {
	BarcodeSelectors,
	BarcodeSelectorsReader,
} from '../materialization/barcode-selectors';
import type { LocalCoverage } from '../local-coverage/local-coverage';
import type { RxDatabase } from 'rxdb';
import type { SyncCollectionName } from '../collections/engine-collections';

export type { MaintenanceLaneName } from './lane-registry';

export type MaintenanceLaneReport = {
	lane: MaintenanceLaneName;
	status: 'ran' | 'skipped' | 'error';
	reason?: string;
	error?: string;
};

/** The host port the query-total retry lane drains through (host-executed fetch). */
export type QueryTotalPort = {
	fetchWooQueryTotal: (input: {
		request: QueryTotalWooRequest;
		signal?: AbortSignal;
	}) => Promise<number | null>;
};

export type QueryTotalCacheEvent = { type: 'query-total-cache'; entries: QueryTotalCacheEntry[] };

// The web host's cadence policies move in with the lanes (mountWebSyncHost
// lanes 4–7) — values preserved verbatim.
export const ORDER_OPEN_RECENT_STATUS = 'pending,processing,on-hold';
export const ORDER_OPEN_RECENT_LIMIT = 200;
export const ORDER_OPEN_RECENT_PRIORITY = 600;
// The products browse-window seed (ADR 0027 §2): a result window of 100 products in the
// POS default catalog sort. This lane seeds only the DEFAULT window — the grid's own
// limit/sort windows (#909) are declared by the require plane, not re-seeded on a timer.
// The window is a row count, not a request size: the fetcher walks it in Performance-dial
// pages (#908). Priority 500 sits BELOW the Tier-0 reference
// lanes (1000–920) and the orders open-recent window (600): a cold browse grid is a
// convenience seed, never a sell-blocker, so it drains after them. 500 (not 599) leaves
// headroom for any future intermediate seed between it and the orders window.
export { PRODUCT_BROWSE_WINDOW_LIMIT };
export const PRODUCT_BROWSE_WINDOW_PRIORITY = 500;
export const REFERENCE_REFRESH_DEDUPE_MS = 4 * 60_000;
export const COVERAGE_COMPACTION_INTERVAL_MS = 5 * 60 * 1_000;
export const COVERAGE_COMPACTION_RETAIN_STALE_FOR_MS = 5 * 60 * 1_000;
export const COVERAGE_COMPACTION_LEASE_FOR_MS = 30 * 1_000;
export const COVERAGE_COMPACTION_RETRY_AFTER_MS = 5 * 60 * 1_000;
export const COVERAGE_COMPACTION_MIN_EXPIRED_DOCUMENTS = 1;

type MaintenanceLaneDeps = {
	manager: StoreScopeManager;
	databaseFor: (scopeId: string) => RxDatabase | null;
	coverageFor: (scopeId: string) => LocalCoverage | null;
	/** The per-scope barcode carriers a scheduler pull materializes products/variations by. */
	barcodeSelectorsFor?: (scopeId: string) => BarcodeSelectors | null;
	/** Namespaced read base (site.syncBaseUrl) — the drain fetchers pull through it. */
	syncBaseUrl: string;
	/** The engine's transport port, threaded into every drain fetcher pull. */
	fetcher: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
	connectivity: () => 'online' | 'offline' | 'degraded';
	diagnostics: SyncObserver;
	withCollectionActivity?: <T>(
		collection: SyncCollectionName,
		work: () => Promise<T>
	) => Promise<T>;
	/** Lease owner recorded on claimed rows — unique per engine instance. */
	ownerId: () => string;
	/** Current facade-configured record cap for scheduler data requests. */
	pullBatchSize?: () => number | undefined;
	queryTotal?: QueryTotalPort;
	censusFreshForMs: number;
	customerTrickleStateFor: (scopeId: string) => CustomerTrickleStateStore;
	censusTotals: () => Promise<CensusTotals>;
	customerCensusTotal: () => Promise<CensusTotal | null>;
	productTrickleStateFor: (scopeId: string) => ProductTrickleStateStore;
	productCensusTotal: () => Promise<CensusTotal | null>;
	variationPrefetchStateFor: (scopeId: string) => VariationPrefetchStateStore;
	variationCensusTotal: () => Promise<CensusTotal | null>;
	hasPendingInteractiveWork: () => boolean;
	lastUserActivityMs?: () => number;
	emitEvent: (event: QueryTotalCacheEvent) => void;
	now?: () => number;
	isServerBackingOff?: (atMs: number) => boolean;
	isServerRetryAfterActive?: (atMs: number) => boolean;
};

/** Per-tick options — only the query-total lane reads them (manual census checks). */
export type MaintenanceLaneTickOptions = {
	/** Probe this one census key now, bypassing its freshness window; skip the full scan. */
	forceCensusCollection?: SyncCollectionName;
	/** Bypass every census entry's freshness window — the manual "check everything" path. */
	forceAllCensus?: boolean;
};

export type MaintenanceLane = {
	tick(signal?: AbortSignal, options?: MaintenanceLaneTickOptions): Promise<MaintenanceLaneReport>;
	lastError(): string | null;
};

export type MaintenanceLanes = {
	[
		Entry in MaintenanceLaneRegistryEntry as Entry['targetKey']
	]: Entry['laneName'] extends 'query-total-retry' ? MaintenanceLane | null : MaintenanceLane;
};

type MaintenanceLaneBodyReport = {
	summary: string | null;
	level?: 'info' | 'warn' | 'error';
	status?: 'skipped';
	reason?: string;
};

/** A census request state runnable NOW — shared by the periodic scan's seeding and the forced per-collection check. */
function censusRunnableState(
	collection: SyncCollectionName,
	nowMs: number
): QueryTotalRequestState {
	const queryKey = censusQueryKey(collection);
	return {
		queryKey,
		status: 'failed',
		ownerId: null,
		claimedUntilMs: null,
		attempt: 0,
		retryAfterMs: nowMs,
		updatedAtMs: nowMs,
		request: {
			queryKey,
			method: 'GET',
			endpoint: collection,
			params: {
				page: 1,
				per_page: 1,
				// Count what the till can sell: published products, and their
				// published variations via the plugin's cross-parent route.
				...(collection === 'products' || collection === 'variations' ? { status: 'publish' } : {}),
			},
			totalHeader: 'X-WP-Total',
		},
	};
}

export function createMaintenanceLanes(deps: MaintenanceLaneDeps): MaintenanceLanes {
	const now = deps.now ?? (() => Date.now());
	const pressureDeferredLanes = new Set<MaintenanceLaneName>([
		'customer-trickle',
		'product-trickle',
		'variation-prefetch',
		'existence-prime',
		'existence-reconcile',
		'query-total-retry',
	]);
	// Pressure still wins each ordinary tick, but it cannot suppress convergence for an
	// entire slow-server session (mono#1159, owner ruling 2026-08-12).
	const lastRanAtMs = new Map<MaintenanceLaneName, number>();

	/** Shared guard/report/error scaffolding — the body runs scope-bound. */
	function lane(
		name: MaintenanceLaneName,
		body: (
			db: RxDatabase,
			scopeId: string,
			signal: AbortSignal,
			fetcher: MaintenanceLaneDeps['fetcher'],
			tick: { starvation: boolean } & MaintenanceLaneTickOptions
		) => Promise<MaintenanceLaneBodyReport>
	): MaintenanceLane {
		let lastError: string | null = null;
		return {
			tick: async (callerSignal, options) => {
				let starvation = false;
				let starvationReservationAtMs: number | null = null;
				if (callerSignal?.aborted) {
					return { lane: name, status: 'skipped', reason: 'aborted' };
				}
				if (deps.connectivity() === 'offline') {
					return { lane: name, status: 'skipped', reason: 'offline' };
				}
				if (pressureDeferredLanes.has(name)) {
					const tickAtMs = now();
					if (deps.isServerBackingOff?.(tickAtMs)) {
						const previousRunAtMs = lastRanAtMs.get(name);
						if (previousRunAtMs === undefined) {
							lastRanAtMs.set(name, tickAtMs);
							return { lane: name, status: 'skipped', reason: 'server-pressure' };
						}
						if (deps.isServerRetryAfterActive?.(tickAtMs)) {
							return { lane: name, status: 'skipped', reason: 'server-pressure' };
						}
						const starvationCeilingMs = 2 * laneRegistryEntry(name).defaultMs;
						if (tickAtMs - previousRunAtMs < starvationCeilingMs) {
							return { lane: name, status: 'skipped', reason: 'server-pressure' };
						}
						starvation = true;
						starvationReservationAtMs = tickAtMs;
					}
				}
				if (deps.manager.activeScope === null) {
					return { lane: name, status: 'skipped', reason: 'no active scope' };
				}
				if (starvationReservationAtMs !== null) {
					lastRanAtMs.set(name, starvationReservationAtMs);
				}
				try {
					const report = await deps.manager.runGuarded<MaintenanceLaneReport>(async (bound) => {
						const db = deps.databaseFor(bound.scopeId);
						if (!db) {
							return { lane: name, status: 'skipped', reason: 'scope database not open' };
						}
						// Caller (host stop) + scope signals combine through a MANUAL
						// controller — AbortSignal.any is unavailable on RN/Expo fetch
						// polyfills (the StoreScopeManager contract). The composite is
						// the lane body's LOOP signal (between-request checks) and the
						// tick side of the per-request merge below.
						const composite = new AbortController();
						const abortComposite = () => composite.abort();
						if (callerSignal?.aborted || bound.signal.aborted) {
							abortComposite();
						} else {
							callerSignal?.addEventListener('abort', abortComposite, { once: true });
							bound.signal.addEventListener('abort', abortComposite, { once: true });
						}
						const signal = composite.signal;
						// Per-request combining lives BELOW bindFetch: scopedFetch hands
						// the ticket signal down as init.signal; merge it with the tick
						// composite and forward ONE signal to the raw transport. The
						// wrapper handed to the lane BODY then absorbs any init.signal
						// its fetch helpers pass (httpGet threads the loop signal) so a
						// bound fetcher never receives one (which would force
						// AbortSignal.any inside scopedFetch — the Hermes bomb).
						const tickFetcher: MaintenanceLaneDeps['fetcher'] = async (url, init) => {
							const ticketSignal = init?.signal;
							const combined = new AbortController();
							const abort = () => combined.abort();
							if (ticketSignal?.aborted || signal.aborted) {
								abort();
							} else {
								ticketSignal?.addEventListener('abort', abort, { once: true });
								signal.addEventListener('abort', abort, { once: true });
							}
							try {
								return await deps.fetcher(url, { ...init, signal: combined.signal });
							} finally {
								ticketSignal?.removeEventListener('abort', abort);
								signal.removeEventListener('abort', abort);
							}
						};
						const rawBoundFetch = bound.bindFetch(tickFetcher);
						const boundFetch: MaintenanceLaneDeps['fetcher'] = (url, init) => {
							const { signal: _absorbed, ...rest } = (init ?? {}) as {
								signal?: AbortSignal;
							} & Record<string, unknown>;
							return rawBoundFetch(url, rest as { signal?: AbortSignal });
						};
						let bodyReport: MaintenanceLaneBodyReport | undefined;
						let wrote;
						try {
							wrote = await bound.guardWrite(async () => {
								bodyReport = await body(db, bound.scopeId, signal, boundFetch, {
									starvation,
									...(options?.forceCensusCollection !== undefined
										? { forceCensusCollection: options.forceCensusCollection }
										: {}),
									...(options?.forceAllCensus === true ? { forceAllCensus: true } : {}),
								});
								if (bodyReport.status !== 'skipped' && pressureDeferredLanes.has(name)) {
									lastRanAtMs.set(name, now());
								}
								const { summary, level } = bodyReport;
								if (summary !== null) {
									deps.diagnostics({
										// The lane rides in `fields`, never in the event type: types are a
										// closed, labelled set (each needs a merchant-readable title in the
										// event registry), so a per-lane `${name}.tick` type would mint
										// unlabelled types every time a lane is added.
										type: 'maintenance.lane.tick',
										level: level ?? 'info',
										message: summary,
										fields: { lane: name, ...(starvation ? { starvation: true } : {}) },
									});
								}
							});
						} finally {
							callerSignal?.removeEventListener('abort', abortComposite);
							bound.signal.removeEventListener('abort', abortComposite);
						}
						if (wrote === 'dropped') {
							return {
								lane: name,
								status: 'skipped',
								reason: 'scope moved mid-tick (writes dropped)',
							};
						}
						if (bodyReport?.status === 'skipped') {
							return { lane: name, status: 'skipped', reason: bodyReport.reason };
						}
						return { lane: name, status: 'ran' };
					});
					lastError = null;
					return report;
				} catch (error) {
					if (
						callerSignal?.aborted ||
						(error instanceof Error &&
							(error.name === 'AbortError' || error.name === 'ScopeStaleError'))
					) {
						lastError = null;
						return { lane: name, status: 'skipped', reason: 'aborted' };
					}
					const message = error instanceof Error ? error.message : String(error);
					lastError = message;
					deps.diagnostics({
						type: 'maintenance.lane.error',
						level: 'error',
						message,
						fields: { lane: name },
					});
					return { lane: name, status: 'error', error: message };
				}
			},
			lastError: () => lastError,
		};
	}

	const seedSummary = (
		label: string,
		result: SeedPersistedSchedulerTasksResult
	): { summary: string | null; level?: 'info' | 'error' } => {
		if (result.inserted === 0 && result.requeued === 0 && result.claimLost === 0)
			return { summary: null };
		return {
			level: result.claimLost > 0 ? 'error' : 'info',
			summary: `${label}: ${result.inserted} inserted, ${result.requeued} requeued${result.claimLost > 0 ? `, ${result.claimLost} claim lost` : ''}`,
		};
	};

	const schedulerDrain = lane('scheduler-drain', async (db, _scopeId, signal, fetcher) => {
		const coverage = deps.coverageFor(_scopeId);
		if (!coverage) return { summary: null };
		// A reader, not a snapshot: this drain runs many tasks and a config poll can
		// move the carrier partway through (see barcode-selectors).
		const barcodeSelectors: BarcodeSelectorsReader | undefined =
			deps.barcodeSelectorsFor === undefined
				? undefined
				: () => deps.barcodeSelectorsFor!(_scopeId) ?? undefined;
		const result = await runEngineSchedulerDrain({
			db: db as unknown as SchedulerDrainDatabase,
			coverage,
			...(barcodeSelectors !== undefined ? { barcodeSelectors } : {}),
			baseUrl: deps.syncBaseUrl,
			ownerId: deps.ownerId(),
			censusFreshForMs: deps.censusFreshForMs,
			diagnostics: deps.diagnostics,
			...(deps.pullBatchSize !== undefined ? { pullBatchSize: deps.pullBatchSize } : {}),
			fetcher,
			signal,
			// Snapshot + live function: the heartbeat renewals inside the drain must track
			// an injected clock, not the tick's frozen snapshot (#1175 review P2).
			...(deps.now !== undefined ? { nowMs: deps.now(), now: deps.now } : {}),
			...(deps.withCollectionActivity !== undefined
				? {
						withCollectionActivity: <T>(collection: string, work: () => Promise<T>) =>
							deps.withCollectionActivity!(collection as SyncCollectionName, work),
					}
				: {}),
		});
		const hasActivity =
			result.totalRequests > 0 ||
			result.succeeded > 0 ||
			result.failed > 0 ||
			result.claimLost > 0 ||
			result.completionLost > 0 ||
			result.failureLost > 0 ||
			result.renewalLost > 0;
		if (!hasActivity) return { summary: null };
		// Only an actual fetch failure is an ERROR — including `failureLost`, where the
		// fetch threw and only the failure write was lost. `completionLost`/`renewalLost`
		// mean another owner took the row mid-flight: a contention release, routine on a
		// slow server. Logging them red put "could not load" rows in front of cashiers
		// for drains that lost a benign race (2026-08-12 HAR), so they are warnings.
		// `claimLost` stays INFO: the row was never claimed, so no work was attempted.
		const drainLevel =
			result.failed > 0 || result.failureLost > 0
				? 'error'
				: result.completionLost > 0 || result.renewalLost > 0
					? 'warn'
					: 'info';
		deps.diagnostics({
			type: 'queue.scheduler.drain',
			level: drainLevel,
			fields: {
				scanned: result.scanned,
				succeeded: result.succeeded,
				failed: result.failed,
				claimLost: result.claimLost,
				completionLost: result.completionLost,
				failureLost: result.failureLost,
				renewalLost: result.renewalLost,
				documents: result.totalDocuments,
				requests: result.totalRequests,
			},
		});
		return {
			level: drainLevel,
			summary: `Scheduler drain: ${result.succeeded} succeeded, ${result.failed} failed, ${result.totalRequests} requests, ${result.totalDocuments} documents`,
		};
	});

	const orderWindowSeed = lane('order-window-seed', async (db) => {
		const result = await seedOrderFilterSchedulerTask({
			status: ORDER_OPEN_RECENT_STATUS,
			search: '',
			limit: ORDER_OPEN_RECENT_LIMIT,
			priority: ORDER_OPEN_RECENT_PRIORITY,
			database: db,
			// The injected clock reaches the SEED's dedupe check too — the drain
			// already ticked on deps.now; a seed on Date.now() would judge the
			// completed-dedupe window on a different clock (host adoption #430:
			// manual-mode harnesses advance one deterministic clock).
			...(deps.now !== undefined ? { nowMs: deps.now() } : {}),
		});
		return seedSummary('Orders open-recent window seed (windowed, not a bulk pull)', result);
	});

	const productBrowseWindowSeed = lane('product-browse-window-seed', async (db) => {
		const result = await seedProductBrowseWindowSchedulerTask({
			limit: PRODUCT_BROWSE_WINDOW_LIMIT,
			priority: PRODUCT_BROWSE_WINDOW_PRIORITY,
			database: db,
			// Same one-clock rule as the order window seed above.
			...(deps.now !== undefined ? { nowMs: deps.now() } : {}),
		});
		return seedSummary('Products browse-window seed (windowed, not a bulk pull)', result);
	});

	const referenceSeed = lane('reference-seed', async (db) => {
		const counts = await Promise.all(
			REFERENCE_COLLECTIONS.map((collection) => db.collections[collection].count().exec())
		);
		const materialized = REFERENCE_COLLECTIONS.filter((_, index) => counts[index] > 0);
		const unmaterialized = REFERENCE_COLLECTIONS.filter((_, index) => counts[index] === 0);
		const census = unmaterialized.length > 0 ? await deps.censusTotals() : null;
		const backfill = unmaterialized.filter((collection) => {
			const entry = census?.[collection];
			return entry?.fresh === true && entry.total > 0;
		});
		const collections = [...materialized, ...backfill];
		if (collections.length === 0) {
			return { summary: null, status: 'skipped', reason: 'no reference collections need seeding' };
		}
		const result = await seedReferenceLanes({
			collections,
			completedDedupeForMs: REFERENCE_REFRESH_DEDUPE_MS,
			database: db,
			// Same one-clock rule as the order window seed above.
			...(deps.now !== undefined ? { nowMs: deps.now() } : {}),
		});
		const label = `Reference refresh (categories + brands + tags + coupons${backfill.length > 0 ? `; backfilled: ${backfill.join(', ')}` : ''})`;
		return seedSummary(label, result);
	});

	const queryTotal = deps.queryTotal;
	const queryTotalRetry = queryTotal
		? lane('query-total-retry', async (db, _scopeId, signal, _fetcher, tick) => {
				const nowMs = now();
				const stateRepository = withLedgerRecovery({
					database: db,
					trigger: 'query-total',
					create: () => new RxQueryTotalRequestStateRepository(db as never),
				});
				const cacheRepository = withLedgerRecovery({
					database: db,
					trigger: 'query-total',
					create: () => new RxQueryTotalCacheRepository(db as never),
				});
				const censusQueryKeys = SUPPORTED_CENSUS_COLLECTIONS.map(censusQueryKey);
				const forced = tick.forceCensusCollection;
				if (forced !== undefined) {
					const queryKey = censusQueryKey(forced);
					const [currentState] = await stateRepository.readForQueryKeys([queryKey]);
					// Only a live claim blocks the forced probe — that owner's result lands
					// in the shared cache anyway. A failed state mid-backoff or an expired
					// in-flight lease is exactly what the manual retry must override.
					if (
						currentState &&
						currentState.status === 'in-flight' &&
						currentState.claimedUntilMs !== null &&
						currentState.claimedUntilMs > nowMs
					) {
						return { summary: null, status: 'skipped', reason: 'query total request in flight' };
					}
					const runnableState = censusRunnableState(forced, nowMs);
					if (currentState) {
						await stateRepository.wake(currentState, runnableState);
					} else {
						await stateRepository.claimNew(runnableState);
					}
				} else {
					const [censusCacheEntries, censusRequestStates] = await Promise.all([
						cacheRepository.readForQueryKeys(censusQueryKeys),
						stateRepository.readForQueryKeys(censusQueryKeys),
					]);
					const censusCacheByKey = new Map(
						censusCacheEntries.map((entry) => [entry.queryKey, entry])
					);
					const censusStateByKey = new Map(
						censusRequestStates.map((state) => [state.queryKey, state])
					);
					for (const collection of SUPPORTED_CENSUS_COLLECTIONS) {
						const queryKey = censusQueryKey(collection);
						const cacheEntry = censusCacheByKey.get(queryKey);
						if (!tick.forceAllCensus && cacheEntry && cacheEntry.freshUntilMs > nowMs) continue;
						const currentState = censusStateByKey.get(queryKey);
						// A force-all wakes backoff and expired leases, but never steals a
						// live claim: that owner's result will land in the shared cache.
						if (
							currentState &&
							(tick.forceAllCensus
								? currentState.status === 'in-flight' &&
									currentState.claimedUntilMs !== null &&
									currentState.claimedUntilMs > nowMs
								: currentState.status !== 'idle')
						)
							continue;
						const runnableState = censusRunnableState(collection, nowMs);
						if (currentState) {
							await stateRepository.wake(currentState, runnableState);
						} else {
							await stateRepository.claimNew(runnableState);
						}
					}
				}
				const result = await runQueryTotalRetryRequests({
					stateRepository,
					cacheRepository,
					// The port returns only a total/null, so response status and headers are not observable here.
					fetchWooQueryTotal: ({ request, signal: requestSignal }) =>
						queryTotal.fetchWooQueryTotal({
							request,
							...(requestSignal !== undefined ? { signal: requestSignal } : {}),
						}),
					signal,
					ownerId: deps.ownerId(),
					nowMs,
					getNowMs: now,
					leaseForMs: QUERY_TOTAL_LEASE_FOR_MS,
					retryAfterMs: QUERY_TOTAL_RETRY_AFTER_MS,
					freshForMs: (request) =>
						censusCollectionFromQueryKey(request.queryKey) === null
							? QUERY_TOTAL_FRESH_FOR_MS
							: deps.censusFreshForMs,
					maxRequests:
						forced !== undefined || (tick.starvation && !tick.forceAllCensus)
							? 1
							: laneRegistryEntry('query-total-retry').maxRequestsPerTick!,
					...(forced !== undefined ? { forceQueryKey: censusQueryKey(forced) } : {}),
					...(tick.forceAllCensus ? { ignoreFreshQueryKeys: censusQueryKeys } : {}),
				});
				if (result.cacheEntries.length > 0) {
					deps.emitEvent({ type: 'query-total-cache', entries: result.cacheEntries });
				}
				// The periodic scan reports failures in its summary and lets backoff retry;
				// a forced check is a direct user action, so its failure must surface as a
				// lane error (status + lastError + events), not a healthy-looking count.
				if ((forced !== undefined || tick.forceAllCensus) && result.failed > 0) {
					throw new Error(
						forced === undefined
							? 'Census refresh failed during full refresh'
							: `Census refresh failed for ${forced}`
					);
				}
				if (
					result.succeeded === 0 &&
					result.failed === 0 &&
					result.claimLost === 0 &&
					result.unsupported === 0 &&
					result.skippedMissingRequest === 0
				) {
					return { summary: null };
				}
				return {
					summary: `Query total retry scan: ${result.succeeded} succeeded, ${result.unsupported} unsupported, ${result.failed} failed, ${result.claimLost} claim lost, ${result.skippedMissingRequest} missing request metadata`,
				};
			})
		: null;
	const customerTrickle = lane('customer-trickle', async (db, scopeId, signal, fetcher) => {
		const result = await tickCustomerTrickle({
			baseUrl: deps.syncBaseUrl,
			database: db,
			fetcher,
			stateStore: deps.customerTrickleStateFor(scopeId),
			hasPendingWork: deps.hasPendingInteractiveWork,
			customerCensusTotal: deps.customerCensusTotal,
			now,
			...(deps.lastUserActivityMs !== undefined
				? { lastUserActivityMs: deps.lastUserActivityMs }
				: {}),
			signal,
		});
		if (result.status !== 'ran') {
			return { summary: null, status: 'skipped', reason: result.reason };
		}
		return {
			summary: `Customer trickle: page ${result.page}, ${result.rows} customers`,
		};
	});
	const productTrickle = lane('product-trickle', async (db, scopeId, signal, fetcher) => {
		const barcodeSelectors = () => deps.barcodeSelectorsFor?.(scopeId) ?? undefined;
		const result = await tickProductTrickle({
			baseUrl: deps.syncBaseUrl,
			database: db,
			fetcher,
			stateStore: deps.productTrickleStateFor(scopeId),
			hasPendingWork: deps.hasPendingInteractiveWork,
			productCensusTotal: deps.productCensusTotal,
			barcodeSelectors,
			now,
			...(deps.lastUserActivityMs !== undefined
				? { lastUserActivityMs: deps.lastUserActivityMs }
				: {}),
			signal,
		});
		if (result.status !== 'ran') {
			return { summary: null, status: 'skipped', reason: result.reason };
		}
		return { summary: `Product trickle: page ${result.page}, ${result.rows} products` };
	});
	const variationPrefetch = lane('variation-prefetch', async (db, scopeId, signal, fetcher) => {
		const barcodeSelectors: BarcodeSelectorsReader | undefined =
			deps.barcodeSelectorsFor === undefined
				? undefined
				: () => deps.barcodeSelectorsFor!(scopeId) ?? undefined;
		const result = await tickVariationPrefetch({
			database: db,
			fetcher,
			syncBaseUrl: deps.syncBaseUrl,
			diagnostics: deps.diagnostics,
			...(deps.pullBatchSize !== undefined ? { pullBatchSize: deps.pullBatchSize } : {}),
			...(barcodeSelectors !== undefined ? { barcodeSelectors } : {}),
			stateStore: deps.variationPrefetchStateFor(scopeId),
			hasPendingWork: deps.hasPendingInteractiveWork,
			variationCensusTotal: deps.variationCensusTotal,
			now,
			...(deps.lastUserActivityMs !== undefined
				? { lastUserActivityMs: deps.lastUserActivityMs }
				: {}),
			signal,
		});
		if (result.status !== 'ran') {
			return { summary: null, status: 'skipped', reason: result.reason };
		}
		return {
			summary: `Variation prefetch: parent ${result.parentWooId ?? 'none'}, ${result.requestedIds} requested`,
		};
	});

	// Per SCOPE, not per engine: switching A→B→A must not let B's compaction
	// clock suppress A's (they are different databases).
	const lastCompactedAtByScope = new Map<string, number>();
	const coverageCompaction = lane('coverage-compaction', async (db, scopeId) => {
		const nowMs = now();
		const coverage = deps.coverageFor(scopeId);
		if (!coverage) return { summary: null };
		const result = await coverage.maintainCompaction({
			ownerId: deps.ownerId(),
			intervalMs: COVERAGE_COMPACTION_INTERVAL_MS,
			minExpiredDocuments: COVERAGE_COMPACTION_MIN_EXPIRED_DOCUMENTS,
			lastCompactedAtMs: lastCompactedAtByScope.get(scopeId) ?? null,
			leaseTtlMs: COVERAGE_COMPACTION_LEASE_FOR_MS,
			failureBackoffMs: COVERAGE_COMPACTION_RETRY_AFTER_MS,
		});
		if (result.status === 'compacted') {
			lastCompactedAtByScope.set(scopeId, nowMs);
			return { summary: `Coverage compaction: compacted at ${nowMs}` };
		}
		return { summary: null };
	});

	const existencePrime = lane('existence-prime', async (_db, scopeId, _signal, fetcher, tick) => {
		const startedAt = now();
		const coverage = deps.coverageFor(scopeId);
		if (!coverage) return { summary: null };
		const result = await coverage.primeManifest(
			{
				fetcher: (url, init) => fetcher(url, init?.signal ? { signal: init.signal } : undefined),
				syncBaseUrl: deps.syncBaseUrl,
			},
			tick.starvation ? { maxChunks: 1 } : undefined
		);
		deps.diagnostics({
			type: 'coverage.existence-prime',
			level: 'info',
			fields: { ...result, durationMs: now() - startedAt },
		});
		return {
			summary: `Existence prime: ${result.products} products/variations, ${result.customers} customers, ${result.orders} orders`,
		};
	});

	const existenceReconcile = lane(
		'existence-reconcile',
		async (_db, scopeId, signal, fetcher, tick) => {
			const startedAt = now();
			const coverage = deps.coverageFor(scopeId);
			if (!coverage) return { summary: null };
			const result = await coverage.reconcilePass(
				signal,
				fetcher,
				tick.starvation ? () => false : () => Boolean(deps.isServerBackingOff?.(now())),
				tick.starvation ? { maxScanPagesPerSpace: 1, maxDrillDowns: 1 } : undefined
			);
			deps.diagnostics({
				type: 'coverage.existence-reconcile',
				level: 'info',
				fields: { ...result, durationMs: now() - startedAt },
			});
			return {
				summary: `Existence audit: ${result.buckets} buckets (${result.emptyBuckets} empty skipped), ${result.pruned} pruned, ${result.missing} missing (not fetched), ${result.changed} changed (not fetched), ${result.skippedDirty} dirty skipped`,
				...(result.deferred ? { status: 'skipped' as const, reason: 'server-pressure' } : {}),
			};
		}
	);

	return {
		schedulerDrain,
		orderWindowSeed,
		productBrowseWindowSeed,
		referenceSeed,
		queryTotalRetry,
		customerTrickle,
		productTrickle,
		variationPrefetch,
		coverageCompaction,
		existencePrime,
		existenceReconcile,
	};
}
