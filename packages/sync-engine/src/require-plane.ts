/**
 * The demand plane (facade slice 4): `require(requirement) → RequirementHandle`
 * — a component-declared data requirement as data (CONTEXT.md), resolved
 * coverage-aware for apps/main. The engine owns both local coverage evidence
 * and its persisted scheduler tier; callers interact only through typed
 * requirements and handles. Concretely:
 *
 *  - `targeted-records` (targeted-shape collections, wooIds required): missing
 *    ids are pulled directly through the descriptor machinery; all-present
 *    resolves serve-local WITHOUT a fetch.
 *  - `refresh` (greedy-prunable / upsert-refresh collections): one re-pull of
 *    the small collection (that IS the lane's coverage contract).
 *  - A higher-priority requirement enqueued behind a lower one runs FIRST
 *    (the queue re-sorts on every enqueue; only an explicit release aborts
 *    in-flight foreground scheduler work).
 *  - `release()` removes queued work or aborts an active foreground execution;
 *    either way `ready` resolves `{ action: 'released' }`.
 *
 * The two bounded browse windows accept typed dimensions. Their persisted scheduler
 * descriptors are an internal encoding, derived behind this interface.
 */

/**
 * Durability follows the requirement's ANCHORING, not its collection:
 * UI-declared requirements are re-declared on every render (self-healing →
 * the in-memory queue is correct); workflow-anchored requirements are one-shot
 * with nothing re-declaring them (→ the durable persisted queue — exactly the
 * orders paths). Convergence trigger: a requirement kind that becomes
 * workflow-anchored moves to the durable queue per-kind.
 */

import type { Fetcher, StoreScopeManager, SyncObserver } from '@wcpos/sync-core';

import {
	COLLECTION_DESCRIPTORS,
	type GreedyPrunableDescriptor,
	type UpsertRefreshDescriptor,
} from './collections/collection-descriptors';
import { pullTargetedByIds, refreshCollection } from './change-signal/change-signal-handlers';
import {
	censusQueryKey,
	emptyPersistedSchedulerTaskRunnerResult,
	type FetchTask,
	ORDER_SCHEDULER_LEASE_FOR_MS,
	orderBrowserQueryKey,
	parseOrderBrowserSchedulerDescriptor,
	parseProductBrowseWindowDescriptor,
	type PersistedSchedulerTaskRunnerResult,
	type ProductBrowseWindowOrderby,
	productBrowseWindowQueryKeyFromDimensions,
	runEngineSchedulerDrain,
	runEngineSchedulerTask,
	type SchedulerDrainDatabase,
	seedOrderFilterSchedulerTask,
	seedOrderSchedulerTasks,
	seedProductBrowseWindowSchedulerTask,
	seedReferenceLanes,
	seedTargetedOrderSchedulerTask,
} from './scheduler';
import { REFERENCE_REFRESH_DEDUPE_MS } from './maintenance/maintenance-lanes';
import { RxQueryTotalCacheRepository } from './collections/rx-query-total-cache-repository';

import type { SyncCollectionName } from './collections/engine-collections';
import type { EngineSourceFetcher } from './change-signal/change-signal-source';
import type { RxCollection, RxDatabase } from 'rxdb';
import type { LocalCoverage } from './local-coverage/local-coverage';

const ACTIVE_ORDER_WAIT_TIMEOUT_MS = ORDER_SCHEDULER_LEASE_FOR_MS * 2;

type EngineRequirementCommon = {
	/** Caller-chosen id (diagnostics only; concurrent identical searches coalesce regardless of id). */
	id: string;
	/** Higher runs first. Default 500 (the web scheduler's browse-lane band). */
	priority?: number;
	/** Re-fetch targeted records even when they are already resident. Used by
	 * explicit refresh/re-anchor flows; ordinary requirements stay coverage-aware. */
	forceRefresh?: boolean;
};

export type OrderBrowseDimensions = {
	/** WooCommerce order status, or 'all'. Default 'all'. */
	status?: string;
	/** Raw cashier search text. Default ''. */
	search?: string;
	/** Result-window size. 'all' = ranged fetch-to-completion (Reports). Default 10. */
	limit?: number | 'all';
	customerId?: number;
	cashierId?: number;
	/** Numeric store id or created_via slug (/^[a-z0-9_-]+$/). */
	store?: string;
	/** date_created_gmt range bounds, epoch seconds. */
	afterSeconds?: number;
	beforeSeconds?: number;
	/** WC REST orders orderby enum. Both orderby and order, or neither. */
	orderby?: 'date' | 'modified' | 'id';
	order?: 'asc' | 'desc';
};

export type ProductBrowseDimensions = {
	/** Requested window size, raw — the engine quantizes (steps of 100, cap 1000). Default 100. */
	limit?: number;
	/** WC REST products orderby enum. Both orderby and order, or neither. */
	orderby?: ProductBrowseWindowOrderby;
	order?: 'asc' | 'desc';
	category?: number[];
	tag?: number[];
	brand?: number[];
	featured?: boolean;
	on_sale?: boolean;
	stock_status?: 'instock' | 'outofstock' | 'onbackorder';
};

/**
 * Dedicated search and browse kinds accept typed caller dimensions; callers never
 * construct their lane keys.
 */
export type EngineRequirement = EngineRequirementCommon &
	(
		| { kind: 'targeted-records'; collection: SyncCollectionName; wooIds: number[] }
		// The current bridge narrows this with a runtime Set that TypeScript cannot follow.
		| { kind: 'search'; collection: SyncCollectionName; term: string; limit?: number }
		| { kind: 'refresh'; collection: SyncCollectionName; limit?: number }
		| ({ kind: 'orders-browse'; collection: 'orders' } & OrderBrowseDimensions)
		| ({ kind: 'product-browse'; collection: 'products' } & ProductBrowseDimensions)
	);

export type CoverageOutcome = {
	action: 'serve-local' | 'fetched' | 'released';
	missingRecordIds: number[];
	reason: string;
	documents?: number;
	requests?: number;
};

export type RequirementHandle = {
	ready: Promise<CoverageOutcome>;
	release(): void;
	/** Canonical persisted lane identity for browse kinds; null otherwise. */
	readonly queryKey: string | null;
};

export type RequirePlaneDeps = {
	/** Settles once the initial scope open settled — require() before ready
	 * must queue, not reject with 'no active scope'. */
	awaitReady: () => Promise<void>;
	manager: StoreScopeManager;
	databaseFor: (scopeId: string) => RxDatabase | null;
	coverageFor: (scopeId: string) => LocalCoverage | null;
	fetcher: EngineSourceFetcher;
	syncBaseUrl: string;
	diagnostics: SyncObserver;
	onActivityChange?: (collection: SyncCollectionName, delta: 1 | -1) => void;
	pullBatchSize?: () => number | undefined;
	now?: () => number;
	customerSearchCatalogComplete?: () => Promise<boolean>;
};

type InternalRequirement =
	| EngineRequirement
	| (EngineRequirementCommon & {
			kind: 'query';
			collection: 'orders' | 'products';
			queryKey: string;
	  });

type QueuedRequirement = {
	requirement: InternalRequirement;
	priority: number;
	seq: number;
	subscribers: Set<RequirementSubscriber>;
	searchDedupeKey: string | null;
	released: boolean;
	started: boolean;
	abortController: AbortController;
};

type RequirementSubscriber = {
	resolve: (outcome: CoverageOutcome) => void;
	reject: (error: unknown) => void;
	released: boolean;
};

export type RequirePlane = {
	require(requirement: EngineRequirement): RequirementHandle;
	hasPendingWork(): boolean;
};

export function createRequirePlane(deps: RequirePlaneDeps): RequirePlane {
	const queue: QueuedRequirement[] = [];
	const activeSearches = new Map<string, QueuedRequirement>();
	let seq = 0;
	let running = false;
	const defaultSearchLimit = 25;
	const searchDedupeKey = (requirement: InternalRequirement): string | null =>
		requirement.kind === 'search'
			? `${requirement.collection}\u0000${(requirement.term ?? '').trim()}\u0000${requirement.limit ?? defaultSearchLimit}`
			: null;
	const forgetSearch = (item: QueuedRequirement): void => {
		if (item.searchDedupeKey && activeSearches.get(item.searchDedupeKey) === item) {
			activeSearches.delete(item.searchDedupeKey);
		}
	};
	const progressObserver = (requirement: InternalRequirement) => {
		let documents = 0;
		let requests = 0;
		return (progress: { collection: string; documents: number; requests: number }): void => {
			deps.diagnostics({
				type: 'queue.drain.progress',
				level: 'info',
				collection: progress.collection,
				fields: {
					requirementId: requirement.id,
					documents: progress.documents - documents,
					requests: progress.requests - requests,
				},
			});
			documents = progress.documents;
			requests = progress.requests;
		};
	};

	const descriptorFor = (collection: SyncCollectionName) =>
		COLLECTION_DESCRIPTORS.find((d) => d.collection === collection);

	const emptyDrainResult = emptyPersistedSchedulerTaskRunnerResult;

	const drainLostOutcomeCount = (result: PersistedSchedulerTaskRunnerResult): number =>
		result.claimLost + result.completionLost + result.failureLost + result.renewalLost;

	const releasedOutcome = (): CoverageOutcome => ({
		action: 'released',
		missingRecordIds: [],
		reason: 'released during drain',
	});

	async function missingWooIds(
		db: RxDatabase,
		d: { collection: SyncCollectionName; wooIdField: string },
		wooIds: number[]
	): Promise<number[]> {
		const collection = db.collections[d.collection] as RxCollection;
		const docs = await collection
			.find({ selector: { [d.wooIdField]: { $in: wooIds } } as never })
			.exec();
		const present = new Set(
			docs.map((doc) => Number((doc.toJSON() as Record<string, unknown>)[d.wooIdField]))
		);
		return wooIds.filter((id) => !present.has(id));
	}

	async function executeOne(item: QueuedRequirement): Promise<CoverageOutcome> {
		await deps.awaitReady();
		return deps.manager.runGuarded(async (bound) => {
			const database = deps.databaseFor(bound.scopeId);
			if (!database) throw new Error('require: scope database not open');
			const coverage = deps.coverageFor(bound.scopeId);
			if (!coverage) throw new Error('require: local coverage not open');
			const descriptor = descriptorFor(item.requirement.collection);
			if (!descriptor)
				throw new Error(`require: unknown collection "${item.requirement.collection}"`);
			// Combine the requirement and scheduler-ticket signals below bindFetch,
			// then absorb helper-provided signals above it. Passing init.signal to a
			// scope-bound fetcher forces AbortSignal.any, which Hermes lacks.
			const requirementFetcher: Fetcher = async (url, init) => {
				const ticketSignal = init?.signal;
				const combined = new AbortController();
				const abort = () => combined.abort();
				if (ticketSignal?.aborted || item.abortController.signal.aborted) abort();
				else {
					ticketSignal?.addEventListener('abort', abort, { once: true });
					item.abortController.signal.addEventListener('abort', abort, { once: true });
				}
				try {
					return await (deps.fetcher as Fetcher)(url, { ...init, signal: combined.signal });
				} finally {
					ticketSignal?.removeEventListener('abort', abort);
					item.abortController.signal.removeEventListener('abort', abort);
				}
			};
			const rawBoundFetch = bound.bindFetch(requirementFetcher);
			const boundFetch: Fetcher = (url, init) => {
				const { signal: _absorbed, ...rest } = (init ?? {}) as { signal?: AbortSignal } & Record<
					string,
					unknown
				>;
				return rawBoundFetch(url, rest as never);
			};
			const ctx = {
				database,
				fetch: boundFetch,
				syncBaseUrl: deps.syncBaseUrl,
				persistState: async () => undefined,
				log: (line: string) =>
					deps.diagnostics({ type: 'coverage.require.log', level: 'debug', message: line }),
				observe: deps.diagnostics,
				...(deps.pullBatchSize !== undefined ? { pullBatchSize: deps.pullBatchSize } : {}),
			};

			if (item.requirement.collection === 'orders' && item.requirement.kind === 'query') {
				const decision = parseOrderBrowserSchedulerDescriptor(item.requirement.queryKey ?? '');
				if (!decision || 'skipReason' in decision) {
					throw new Error(
						`require: unsupported order query (${decision?.skipReason ?? 'missing queryKey'})`
					);
				}
				let drainResult = emptyDrainResult();
				let skippedActive = false;
				const applied = await bound.guardWrite(async () => {
					const seedResult = await seedOrderFilterSchedulerTask({
						...decision.descriptor,
						completedDedupeForMs: item.requirement.forceRefresh ? 0 : undefined,
						database: database,
					});
					if (seedResult.skippedActive > 0) {
						skippedActive = true;
						return;
					}
					drainResult = await runEngineSchedulerDrain({
						db: database as unknown as SchedulerDrainDatabase,
						coverage,
						baseUrl: deps.syncBaseUrl,
						ownerId: 'require-plane',
						fetcher: boundFetch as never,
						diagnostics: deps.diagnostics,
						...(deps.pullBatchSize !== undefined ? { pullBatchSize: deps.pullBatchSize } : {}),
						signal: item.abortController.signal,
						onProgress: progressObserver(item.requirement),
					});
				});
				if (applied === 'dropped')
					throw new Error('require: scope moved mid-query (writes dropped)');
				if (skippedActive)
					return {
						action: 'released',
						missingRecordIds: [],
						reason: 'order query refresh already in progress',
					};
				// #956: a derivable-ledger rebuild aborted the tick — nothing was claimed and
				// nothing was fetched, so release instead of reporting the requirement met.
				if (drainResult.ledgerRebuilt)
					return {
						action: 'released',
						missingRecordIds: [],
						reason: 'local sync bookkeeping was rebuilt mid-drain',
					};
				if (drainResult.failed > 0)
					throw new Error(`require: scheduler drain failed ${drainResult.failed} task(s)`);
				const lost = drainLostOutcomeCount(drainResult);
				// Claim loss means another owner is completing the durable task. Like
				// skippedActive, it releases this caller rather than reporting failure.
				if (lost > 0)
					return {
						action: 'released',
						missingRecordIds: [],
						reason: 'claim lost to another owner',
						documents: drainResult.totalDocuments,
						requests: drainResult.totalRequests,
					};
				return {
					action: 'fetched',
					missingRecordIds: [],
					reason: `drained order query ${decision.descriptor.queryKey}`,
					documents: drainResult.totalDocuments,
					requests: drainResult.totalRequests,
				};
			}

			if (item.requirement.collection === 'products' && item.requirement.kind === 'query') {
				// The products BROWSE WINDOW (ADR 0027 §2, #909). Same durable shape as the
				// orders query above: seed the windowed task, drain it. This is what makes the
				// grid's own limit and sort reach the wire — before it existed, an empty-selector
				// products browse declared no demand at all, so infinite scroll past the cold
				// 100-row seed fetched nothing and a sort change re-sorted the wrong local slice.
				const browseWindow = parseProductBrowseWindowDescriptor(item.requirement.queryKey ?? '');
				if (!browseWindow) {
					throw new Error(
						`require: unsupported product query (${item.requirement.queryKey ?? 'missing queryKey'})`
					);
				}
				let drainResult = emptyDrainResult();
				let skippedActive = false;
				const applied = await bound.guardWrite(async () => {
					const seedResult = await seedProductBrowseWindowSchedulerTask({
						// Spread the WHOLE descriptor, as the orders branch above does. Cherry-picking
						// limit/orderby/order silently dropped every filter dimension: the seeder then
						// rebuilt an UNFILTERED key, so filtered demand could never reach the wire and
						// its coverage lane collided with the unfiltered window's.
						...browseWindow,
						priority: item.priority,
						...(item.requirement.forceRefresh ? { completedDedupeForMs: 0 } : {}),
						database: database,
					});
					if (seedResult.skippedActive > 0) {
						skippedActive = true;
						return;
					}
					drainResult = await runEngineSchedulerDrain({
						db: database as unknown as SchedulerDrainDatabase,
						coverage,
						baseUrl: deps.syncBaseUrl,
						ownerId: 'require-plane',
						fetcher: boundFetch as never,
						diagnostics: deps.diagnostics,
						...(deps.pullBatchSize !== undefined ? { pullBatchSize: deps.pullBatchSize } : {}),
						signal: item.abortController.signal,
						onProgress: progressObserver(item.requirement),
					});
				});
				if (applied === 'dropped')
					throw new Error('require: scope moved mid-query (writes dropped)');
				if (skippedActive)
					return {
						action: 'released',
						missingRecordIds: [],
						reason: 'product browse window already in progress',
					};
				// #956: a derivable-ledger rebuild aborted the tick — nothing was claimed and
				// nothing was fetched, so release instead of reporting the requirement met.
				if (drainResult.ledgerRebuilt)
					return {
						action: 'released',
						missingRecordIds: [],
						reason: 'local sync bookkeeping was rebuilt mid-drain',
					};
				if (drainResult.failed > 0)
					throw new Error(`require: scheduler drain failed ${drainResult.failed} task(s)`);
				const lost = drainLostOutcomeCount(drainResult);
				if (lost > 0)
					return {
						action: 'released',
						missingRecordIds: [],
						reason: 'claim lost to another owner',
						documents: drainResult.totalDocuments,
						requests: drainResult.totalRequests,
					};
				return {
					action: 'fetched',
					missingRecordIds: [],
					reason: `drained product browse window ${item.requirement.queryKey}`,
					documents: drainResult.totalDocuments,
					requests: drainResult.totalRequests,
				};
			}

			if (item.requirement.collection === 'orders' && item.requirement.kind === 'refresh') {
				const refreshRequirement = item.requirement;
				let drainResult = emptyDrainResult();
				let skippedActive = false;
				const applied = await bound.guardWrite(async () => {
					const seedResult = await seedOrderSchedulerTasks({
						perPage: refreshRequirement.limit ?? 250,
						priority: item.priority,
						completedDedupeForMs: item.requirement.forceRefresh ? 0 : undefined,
						database: database,
					});
					if (seedResult.skippedActive > 0) {
						skippedActive = true;
						return;
					}
					drainResult = await runEngineSchedulerDrain({
						db: database as unknown as SchedulerDrainDatabase,
						coverage,
						baseUrl: deps.syncBaseUrl,
						ownerId: 'require-plane',
						fetcher: boundFetch as never,
						diagnostics: deps.diagnostics,
						...(deps.pullBatchSize !== undefined ? { pullBatchSize: deps.pullBatchSize } : {}),
						signal: item.abortController.signal,
						maxRequestsPerTask: Number.POSITIVE_INFINITY,
						onProgress: progressObserver(item.requirement),
					});
				});
				if (applied === 'dropped')
					throw new Error('require: scope moved mid-refresh (writes dropped)');
				if (skippedActive)
					return {
						action: 'released',
						missingRecordIds: [],
						reason: 'full order refresh already in progress',
					};
				// #956: a derivable-ledger rebuild aborted the tick — nothing was claimed and
				// nothing was fetched, so release instead of reporting the requirement met.
				if (drainResult.ledgerRebuilt)
					return {
						action: 'released',
						missingRecordIds: [],
						reason: 'local sync bookkeeping was rebuilt mid-drain',
					};
				if (drainResult.failed > 0)
					throw new Error(`require: scheduler drain failed ${drainResult.failed} task(s)`);
				const lost = drainLostOutcomeCount(drainResult);
				// Claim loss means another owner is completing the durable task. Like
				// skippedActive, it releases this caller rather than reporting failure.
				if (lost > 0)
					return {
						action: 'released',
						missingRecordIds: [],
						reason: 'claim lost to another owner',
						documents: drainResult.totalDocuments,
						requests: drainResult.totalRequests,
					};
				return {
					action: 'fetched',
					missingRecordIds: [],
					reason: 'drained full order refresh',
					documents: drainResult.totalDocuments,
					requests: drainResult.totalRequests,
				};
			}

			// On-demand reference pull (#952). Categories/tags/brands/coupons are no longer
			// seeded at boot; the mounted picker/screen/cart binding that needs one declares a
			// `refresh` and the greedy lane runs HERE, at open. `REFERENCE_REFRESH_DEDUPE_MS`
			// collapses a remount (or a second surface over the same collection) into the one
			// pull, so repeated opens cost nothing until the window lapses.
			if (item.requirement.kind === 'refresh' && descriptor.shape === 'greedy-prunable') {
				let drainResult = emptyDrainResult();
				let skippedActive = false;
				let deduped = false;
				const applied = await bound.guardWrite(async () => {
					const nowMs = deps.now?.();
					const seedResult = await seedReferenceLanes({
						collections: [descriptor.collection],
						completedDedupeForMs: item.requirement.forceRefresh ? 0 : REFERENCE_REFRESH_DEDUPE_MS,
						database: database,
						...(nowMs !== undefined ? { nowMs } : {}),
					});
					// `skippedActive` and `skippedCompleted` are NOT the same answer. An active
					// lane means another owner is mid-pull, which releases this caller the way the
					// order/product branches above do. Only a completed lane inside the dedupe
					// window is a genuine "your data is already fresh" — that one serves local.
					if (seedResult.skippedActive > 0) {
						skippedActive = true;
						return;
					}
					if (seedResult.skippedCompleted > 0) {
						deduped = true;
						return;
					}
					drainResult = await runEngineSchedulerDrain({
						db: database as unknown as SchedulerDrainDatabase,
						coverage,
						baseUrl: deps.syncBaseUrl,
						ownerId: 'require-plane',
						fetcher: boundFetch as never,
						diagnostics: deps.diagnostics,
						...(deps.pullBatchSize !== undefined ? { pullBatchSize: deps.pullBatchSize } : {}),
						signal: item.abortController.signal,
						...(nowMs !== undefined ? { nowMs } : {}),
						onProgress: progressObserver(item.requirement),
					});
				});
				if (applied === 'dropped')
					throw new Error('require: scope moved mid-refresh (writes dropped)');
				if (skippedActive)
					return {
						action: 'released',
						missingRecordIds: [],
						reason: `${descriptor.collection} refresh already in progress`,
					};
				if (deduped) {
					return {
						action: 'serve-local',
						missingRecordIds: [],
						reason: `${descriptor.collection} refreshed within the dedupe window`,
						documents: 0,
						requests: 0,
					};
				}
				// #956: a derivable-ledger rebuild aborted the tick — nothing was claimed and
				// nothing was fetched, so release instead of reporting the requirement met.
				if (drainResult.ledgerRebuilt)
					return {
						action: 'released',
						missingRecordIds: [],
						reason: 'local sync bookkeeping was rebuilt mid-drain',
					};
				if (drainResult.failed > 0)
					throw new Error(`require: scheduler drain failed ${drainResult.failed} task(s)`);
				const lostReferenceClaims = drainLostOutcomeCount(drainResult);
				// Claim loss means another owner is completing the durable task. Like
				// skippedActive, it releases this caller rather than reporting failure.
				if (lostReferenceClaims > 0)
					return {
						action: 'released',
						missingRecordIds: [],
						reason: 'claim lost to another owner',
						documents: drainResult.totalDocuments,
						requests: drainResult.totalRequests,
					};
				return {
					action: 'fetched',
					missingRecordIds: [],
					reason: `drained ${descriptor.collection} refresh`,
					documents: drainResult.totalDocuments,
					requests: drainResult.totalRequests,
				};
			}

			if (item.requirement.kind === 'search') {
				// Products/customers search is UI-anchored (#473): construct the same FetchTask shape
				// in memory and invoke only its registered fetcher. It never enters durable scheduler
				// state, so a periodic drain cannot reclaim it after the declarers release it.
				const searchCollection = item.requirement.collection;
				if (searchCollection !== 'products' && searchCollection !== 'customers') {
					throw new Error(
						`require: 'search' supports products/customers; "${searchCollection}" is unsupported`
					);
				}
				const term = (item.requirement.term ?? '').trim();
				if (term.length === 0) {
					throw new Error("require: 'search' needs a non-empty term");
				}
				const limit = item.requirement.limit ?? defaultSearchLimit;
				if (!Number.isSafeInteger(limit) || limit <= 0) {
					throw new Error("require: 'search' limit must be a positive integer");
				}
				const encodedTerm = encodeURIComponent(term);
				const queryKey =
					searchCollection === 'products'
						? `products:search:${encodedTerm}`
						: `customers:search=${encodedTerm}:limit=${limit}`;
				if (!item.requirement.forceRefresh) {
					const lane = await coverage.readLane(searchCollection, queryKey);
					if (lane?.complete && lane.fresh) {
						return {
							action: 'serve-local',
							missingRecordIds: [],
							reason: `${searchCollection} search fetched within the coverage window`,
							documents: 0,
							requests: 0,
						};
					}
					if (searchCollection === 'products') {
						const now = deps.now ?? Date.now;
						const [entry] = await new RxQueryTotalCacheRepository(
							database as never
						).readForQueryKeys([censusQueryKey('products')]);
						if (
							entry &&
							entry.freshUntilMs > now() &&
							(await database.collections.products.count().exec()) >= entry.totalMatchingRecords
						) {
							return {
								action: 'serve-local',
								missingRecordIds: [],
								reason: 'products catalogue is fully resident locally',
							};
						}
					} else if (await deps.customerSearchCatalogComplete?.()) {
						return {
							action: 'serve-local',
							missingRecordIds: [],
							reason: 'customers catalogue is fully resident locally',
						};
					}
				}
				const task: FetchTask = {
					id: `${queryKey}:windowed`,
					requirementId: item.requirement.id,
					collection: searchCollection,
					queryKey,
					limit,
					priority: item.priority,
					mode: 'windowed',
				};
				let result: Awaited<ReturnType<typeof runEngineSchedulerTask>> | undefined;
				const applied = await bound.guardWrite(async () => {
					result = await runEngineSchedulerTask({
						db: database as unknown as SchedulerDrainDatabase,
						coverage,
						baseUrl: deps.syncBaseUrl,
						fetcher: boundFetch as never,
						...(deps.pullBatchSize !== undefined ? { pullBatchSize: deps.pullBatchSize } : {}),
						signal: item.abortController.signal,
						task,
						onProgress: progressObserver(item.requirement),
					});
				});
				if (applied === 'dropped')
					throw new Error('require: scope moved mid-search (writes dropped)');
				if (item.abortController.signal.aborted) return releasedOutcome();
				if (!result) throw new Error('require: search completed without a fetch result');
				return {
					action: 'fetched',
					missingRecordIds: [],
					reason: `fetched ${searchCollection} search`,
					documents: result.documentCount,
					requests: result.requestCount,
				};
			}

			if (
				item.requirement.kind === 'targeted-records' &&
				item.requirement.collection === 'orders'
			) {
				// Orders (slice 5f): the DURABLE path — a persisted targeted task the
				// scheduler drain completes, so a crash mid-fetch never loses the
				// requirement (the drain lane finishes it later). Presence gate first.
				const wooIds = item.requirement.wooIds ?? [];
				if (wooIds.length === 0) {
					throw new Error("require: 'targeted-records' needs wooIds");
				}
				const orderWooIdLookup = { collection: 'orders' as const, wooIdField: 'wooOrderId' };
				const missing = item.requirement.forceRefresh
					? wooIds
					: await missingWooIds(database, orderWooIdLookup, wooIds);
				if (missing.length === 0) {
					return {
						action: 'serve-local' as const,
						missingRecordIds: [],
						reason: 'every required record is resident',
					};
				}
				const now = deps.now ?? Date.now;
				const activeOrderDeadlineMs = now() + ACTIVE_ORDER_WAIT_TIMEOUT_MS;
				const remainingActiveOrderWaitMs = (remainingCount: number): number => {
					const waitMs = activeOrderDeadlineMs - now();
					if (waitMs <= 0) {
						throw new Error(
							`require: timed out waiting for an active order task after ${ACTIVE_ORDER_WAIT_TIMEOUT_MS}ms; ${remainingCount} required order(s) remain absent`
						);
					}
					return waitMs;
				};
				let remaining = missing;
				let activeOrderWaitStep = 0;
				const activeOrderWaitStepsMs = [50, 250, 1_000] as const;
				while (remaining.length > 0) {
					if (item.abortController.signal.aborted) return releasedOutcome();
					remainingActiveOrderWaitMs(remaining.length);
					let skippedActive = 0;
					let failed = 0;
					const applied = await bound.guardWrite(async () => {
						const nowMs = now();
						const seedResult = await seedTargetedOrderSchedulerTask({
							orderIds: remaining,
							priority: item.priority,
							completedDedupeForMs: 0,
							nowMs,
							database: database,
						});
						skippedActive = seedResult.skippedActive;
						const drainResult = await runEngineSchedulerDrain({
							db: database as unknown as SchedulerDrainDatabase,
							coverage,
							baseUrl: deps.syncBaseUrl,
							ownerId: 'require-plane',
							fetcher: boundFetch as never,
							diagnostics: deps.diagnostics,
							...(deps.pullBatchSize !== undefined ? { pullBatchSize: deps.pullBatchSize } : {}),
							signal: item.abortController.signal,
							nowMs,
							onProgress: progressObserver(item.requirement),
						});
						failed = drainResult.failed;
					});
					if (applied === 'dropped') {
						throw new Error('require: scope moved mid-pull — writes dropped');
					}
					if (item.abortController.signal.aborted) return releasedOutcome();
					remaining = await missingWooIds(database, orderWooIdLookup, remaining);
					if (remaining.length === 0) break;
					if (failed > 0) {
						throw new Error(
							`require: scheduler drain failed ${failed} task(s); ${remaining.length} required order(s) remain absent`
						);
					}
					if (skippedActive === 0) {
						throw new Error(
							`require: scheduler drain completed but ${remaining.length} required order(s) remain absent`
						);
					}
					const backoffMs =
						activeOrderWaitStepsMs[
							Math.min(activeOrderWaitStep, activeOrderWaitStepsMs.length - 1)
						];
					activeOrderWaitStep += 1;
					const waitMs = Math.min(backoffMs, remainingActiveOrderWaitMs(remaining.length));
					await new Promise<void>((resolve) => {
						const signal = item.abortController.signal;
						let timer: ReturnType<typeof setTimeout>;
						const settle = (): void => {
							clearTimeout(timer);
							signal.removeEventListener('abort', settle);
							resolve();
						};
						timer = setTimeout(settle, waitMs);
						signal.addEventListener('abort', settle);
						if (signal.aborted) settle();
					});
					if (item.abortController.signal.aborted) return releasedOutcome();
					if (!bound.isCurrent()) {
						throw new Error('require: scope moved while waiting for an active order task');
					}
					remaining = await missingWooIds(database, orderWooIdLookup, remaining);
				}
				return {
					action: 'fetched' as const,
					missingRecordIds: missing,
					reason: `pulled ${missing.length} missing order(s) via the persisted scheduler`,
				};
			}

			if (item.requirement.kind === 'targeted-records') {
				if (descriptor.shape !== 'targeted') {
					throw new Error(
						`require: 'targeted-records' needs a targeted collection; "${descriptor.collection}" is ${descriptor.shape}`
					);
				}
				const wooIds = item.requirement.wooIds ?? [];
				if (wooIds.length === 0) {
					throw new Error("require: 'targeted-records' needs wooIds");
				}
				const missing = item.requirement.forceRefresh
					? wooIds
					: await missingWooIds(database, descriptor, wooIds);
				if (missing.length === 0) {
					return {
						action: 'serve-local' as const,
						missingRecordIds: [],
						reason: 'every required record is resident',
					};
				}
				if (item.abortController.signal.aborted) return releasedOutcome();
				const applied = await bound.guardWrite(async () => {
					await pullTargetedByIds(ctx, descriptor, missing);
				});
				if (applied === 'dropped') {
					throw new Error('require: scope moved mid-pull — writes dropped');
				}
				if (item.abortController.signal.aborted) return releasedOutcome();
				return {
					action: 'fetched' as const,
					missingRecordIds: missing,
					reason: `pulled ${missing.length} missing record(s)`,
				};
			}

			// kind === 'refresh'
			if (descriptor.shape !== 'greedy-prunable' && descriptor.shape !== 'upsert-refresh') {
				throw new Error(
					`require: 'refresh' covers greedy-prunable/upsert-refresh collections; "${descriptor.collection}" is ${descriptor.shape}`
				);
			}
			if (item.abortController.signal.aborted) return releasedOutcome();
			const applied = await bound.guardWrite(async () => {
				await refreshCollection(
					ctx,
					descriptor as GreedyPrunableDescriptor | UpsertRefreshDescriptor
				);
			});
			if (applied === 'dropped') {
				throw new Error('require: scope moved mid-refresh — writes dropped');
			}
			if (item.abortController.signal.aborted) return releasedOutcome();
			return {
				action: 'fetched' as const,
				missingRecordIds: [],
				reason: `refreshed ${descriptor.collection}`,
			};
		});
	}

	async function pump(): Promise<void> {
		if (running) return;
		running = true;
		try {
			for (;;) {
				// Re-sort each pass: a higher-priority requirement enqueued while this
				// pump was busy PREEMPTS everything still queued.
				queue.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
				const next = queue.shift();
				if (!next) return;
				if (next.released) {
					forgetSearch(next);
					continue; // release() already resolved it — just drop the entry.
				}
				next.started = true;
				const startedAt = Date.now();
				try {
					const outcome = await executeOne(next);
					deps.diagnostics({
						type: 'coverage.require.outcome',
						level: 'info',
						collection: next.requirement.collection,
						fields: {
							requirementId: next.requirement.id,
							kind: next.requirement.kind,
							action: outcome.action,
							documents: outcome.documents ?? 0,
							requests: outcome.requests ?? 0,
							durationMs: Date.now() - startedAt,
						},
					});
					if (outcome.action !== 'released') {
						deps.diagnostics({
							type: outcome.action === 'serve-local' ? 'coverage.gate.hit' : 'coverage.gate.miss',
							level: 'debug',
							collection: next.requirement.collection,
							fields: { requirementId: next.requirement.id, kind: next.requirement.kind },
						});
					}
					for (const subscriber of next.subscribers) {
						if (!subscriber.released) subscriber.resolve(outcome);
					}
				} catch (error) {
					const message =
						error instanceof Error && error.message.startsWith('require: ')
							? error.message
							: error instanceof Error
								? error.name
								: 'UnknownError';
					deps.diagnostics({
						type: 'coverage.require.error',
						level: 'error',
						collection: next.requirement.collection,
						message,
						fields: {
							requirementId: next.requirement.id,
							kind: next.requirement.kind,
							durationMs: Date.now() - startedAt,
						},
					});
					for (const subscriber of next.subscribers) {
						if (!subscriber.released) subscriber.reject(error);
					}
				} finally {
					forgetSearch(next);
				}
			}
		} finally {
			running = false;
		}
	}

	return {
		hasPendingWork: () => running || queue.length > 0,
		require: (requirement) => {
			const queryKey = (() => {
				if (requirement.kind === 'orders-browse') return orderBrowserQueryKey(requirement);
				if (requirement.kind === 'product-browse') {
					return productBrowseWindowQueryKeyFromDimensions(requirement);
				}
				return null;
			})();
			deps.onActivityChange?.(requirement.collection, 1);
			let activitySettled = false;
			const settleActivity = (): void => {
				if (activitySettled) return;
				activitySettled = true;
				deps.onActivityChange?.(requirement.collection, -1);
			};
			// Browse requirements synchronously derive their lane identity, then delegate to
			// the parser-based internal queued path used by the durable scheduler.
			const queuedRequirement: InternalRequirement =
				requirement.kind === 'orders-browse' || requirement.kind === 'product-browse'
					? {
							id: requirement.id,
							collection: requirement.collection,
							kind: 'query',
							queryKey: queryKey!,
							...(requirement.priority !== undefined ? { priority: requirement.priority } : {}),
							...(requirement.forceRefresh !== undefined
								? { forceRefresh: requirement.forceRefresh }
								: {}),
						}
					: requirement;
			const dedupeKey = searchDedupeKey(queuedRequirement);
			let entry = dedupeKey ? activeSearches.get(dedupeKey) : undefined;
			let subscriber: RequirementSubscriber;
			const ready = new Promise<CoverageOutcome>((resolve, reject) => {
				subscriber = {
					resolve: (outcome) => {
						settleActivity();
						resolve(outcome);
					},
					reject: (error) => {
						settleActivity();
						reject(error);
					},
					released: false,
				};
			});
			if (entry) {
				entry.subscribers.add(subscriber!);
				entry.priority = Math.max(entry.priority, requirement.priority ?? 500);
			} else {
				entry = {
					requirement: queuedRequirement,
					priority: requirement.priority ?? 500,
					seq: (seq += 1),
					subscribers: new Set([subscriber!]),
					searchDedupeKey: dedupeKey,
					released: false,
					started: false,
					abortController: new AbortController(),
				};
				if (dedupeKey) activeSearches.set(dedupeKey, entry);
				queue.push(entry);
				void pump();
			}
			return {
				ready,
				queryKey,
				release: () => {
					if (subscriber.released) return;
					subscriber.released = true;
					entry.subscribers.delete(subscriber);
					// Resolve NOW — a released (unmounting) caller must not wait for
					// whatever is in flight ahead of it. The pump drops the entry later.
					subscriber.resolve({
						action: 'released',
						missingRecordIds: [],
						reason: entry.started ? 'released during drain' : 'released before execution',
					});
					if (entry.subscribers.size === 0) {
						entry.released = true;
						forgetSearch(entry);
						entry.abortController.abort(
							new DOMException('Requirement released during drain', 'AbortError')
						);
					}
				},
			};
		},
	};
}
