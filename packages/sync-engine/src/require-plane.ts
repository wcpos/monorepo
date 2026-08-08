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
	BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT,
	censusQueryKey,
	type CustomerBrowseWindowOrderby,
	customerBrowseWindowQueryKeyFromDimensions,
	emptyPersistedSchedulerTaskRunnerResult,
	emptySeedPersistedSchedulerTasksResult,
	type FetchTask,
	laneKeyFor,
	ORDER_SCHEDULER_LEASE_FOR_MS,
	orderBrowserQueryKey,
	parseCustomerBrowseWindowDescriptor,
	parseOrderBrowserSchedulerDescriptor,
	parseProductBrowseWindowDescriptor,
	type PersistedSchedulerTaskOutcomeKind,
	type PersistedSchedulerTaskRunnerResult,
	type ProductBrowseWindowOrderby,
	productBrowseWindowQueryKeyFromDimensions,
	runEngineSchedulerDrain,
	runEngineSchedulerTask,
	type SchedulerDrainDatabase,
	seedCustomerBrowseWindowSchedulerTask,
	seedOrderFilterSchedulerTask,
	seedOrderSchedulerTasks,
	type SeedPersistedSchedulerTasksResult,
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
import type { BarcodeSelectors, BarcodeSelectorsReader } from './materialization/barcode-selectors';

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
	/**
	 * Result-window size. 'all' = ranged fetch-to-completion (Reports). Default 10.
	 * Quantized past one Woo page; uncapped otherwise (#957) — the old 200-record clamp
	 * made every window past 200 collide on one lane key and dead-end the grid.
	 */
	limit?: number | 'all';
	customerId?: number;
	cashierId?: number;
	/** Numeric store id or created_via slug (/^[a-z0-9_-]+$/). */
	store?: string;
	/** date_created_gmt range bounds, epoch seconds. */
	afterSeconds?: number;
	beforeSeconds?: number;
	/** Supported orders orderby values. Both orderby and order, or neither. */
	orderby?: 'date' | 'modified' | 'id' | 'status' | 'customer_id' | 'payment_method' | 'total';
	order?: 'asc' | 'desc';
};

export type ProductBrowseDimensions = {
	/**
	 * Requested window size, raw — the engine quantizes it to steps of 100. There is no
	 * product ceiling (#948): the window grows for as long as the cashier scrolls, and only
	 * the runaway backstop (BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT) refuses. Default 100.
	 */
	limit?: number;
	/** Supported products orderby values. Both orderby and order, or neither. */
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
 * The customers browse window (#951). Demand-driven only — a mounted, sorted grid declares
 * it; nothing seeds it at boot or on idle, so the customers-on-demand ruling (#865) stands.
 * The window is UNCAPPED (R8): it grows with the grid's limit as the cashier scrolls, and the
 * per-request cost stays bounded by the Performance dial instead.
 */
export type CustomerBrowseDimensions = {
	/** Requested window size, raw — the engine quantizes into steps of 100. Default 100. */
	limit?: number;
	/** Supported customers orderby values. Both orderby and order, or neither. */
	orderby?: CustomerBrowseWindowOrderby;
	order?: 'asc' | 'desc';
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
		| ({ kind: 'customer-browse'; collection: 'customers' } & CustomerBrowseDimensions)
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
	/** Canonical persisted lane identity when the requirement maps to one; null otherwise. */
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
	censusFreshForMs?: number;
	customerSearchCatalogComplete?: () => Promise<boolean>;
	/** The per-scope barcode carriers a demand pull materializes products/variations by. */
	barcodeSelectorsFor?: (scopeId: string) => BarcodeSelectors | null;
};

type InternalRequirement =
	| EngineRequirement
	| (EngineRequirementCommon & {
			kind: 'query';
			collection: 'orders' | 'products' | 'customers';
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

/**
 * The drain arguments that genuinely differ between requirement kinds. Everything else a
 * drain tick needs — scope database, coverage, transport, owner id, abort signal, progress
 * observer, batch-size dial — is invariant across every seeded requirement and is supplied
 * once, by the runner.
 */
type RequirementDrainOverrides = Pick<
	Parameters<typeof runEngineSchedulerDrain>[0],
	'taskId' | 'maxRequestsPerTask' | 'refreshBrowseWindowKey' | 'nowMs'
>;

/**
 * One kind's seed: the result, plus any drain argument the seed itself decided (the shared
 * `nowMs` a reference refresh pins across BOTH halves of its tick, notably).
 */
type SeedTick = {
	seed: SeedPersistedSchedulerTasksResult;
	drain?: RequirementDrainOverrides;
};

/**
 * A seed→drain→verdict requirement as data — the whole per-kind variation surface of
 * `runSeedDrain`. The protocol itself (seed inside one guarded write, an active lane
 * releases instead of draining, a dropped write throws, a mid-drain ledger rebuild
 * releases, the verdict comes from `requirementDrainOutcome` over OUR task ids) is
 * invariant and lives in the runner, once.
 */
type SeedDrainRequirement = {
	/** Seed this kind's task(s) inside the guarded write. */
	seed: () => Promise<SeedTick>;
	/** Per-kind drain arguments, merged under whatever the seed returns. */
	drain?: RequirementDrainOverrides;
	/** Thrown when the scope moved mid-tick and the writes were dropped. */
	droppedMessage: string;
	/** Released when another owner already holds this lane (`skippedActive`). */
	activeReason: string;
	/**
	 * Only the reference lanes (#952) treat a COMPLETED lane inside the dedupe window as a
	 * short-circuit: they serve local without draining at all. Every other kind drains and
	 * lets `requirementDrainOutcome` fold `skippedCompleted` into its `freshReason`.
	 */
	dedupedReason?: string;
	fetchedReason: string;
	freshReason: string;
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
	const emptySeedResult = emptySeedPersistedSchedulerTasksResult;

	/**
	 * Task outcomes that mean "another owner took this row mid-flight" rather than "this work
	 * failed". They release the declarer instead of rejecting it.
	 */
	const LOST_TASK_OUTCOMES = new Set<PersistedSchedulerTaskOutcomeKind>([
		'claim-lost',
		'completion-lost',
		'failure-lost',
		'renewal-lost',
	]);

	/**
	 * Turn a drain tick into THIS requirement's outcome.
	 *
	 * A drain runs every runnable task, so its scalar counters describe the tick. Reading them
	 * as if they described one declarer's work meant an unrelated collection's failure rejected
	 * a browse that had actually succeeded, and an unrelated lost claim reported it released.
	 * The seed tells us which task ids are ours; the drain now reports per task; we read only
	 * our own rows.
	 *
	 * `documents`/`requests` are likewise summed over OUR tasks, so a requirement no longer
	 * reports another lane's transfer as its own.
	 */
	const requirementDrainOutcome = (input: {
		drain: PersistedSchedulerTaskRunnerResult;
		seed: SeedPersistedSchedulerTasksResult;
		fetchedReason: string;
		freshReason: string;
	}): CoverageOutcome => {
		const owned = new Set(input.seed.taskIds);
		const mine = input.drain.tasks.filter((outcome) => owned.has(outcome.taskId));
		const failed = mine.filter((outcome) => outcome.kind === 'failed');
		if (failed.length > 0) {
			throw new Error(`require: scheduler drain failed ${failed.length} task(s)`);
		}
		const documents = mine.reduce((total, outcome) => total + outcome.documents, 0);
		const requests = mine.reduce((total, outcome) => total + outcome.requests, 0);
		if (mine.some((outcome) => LOST_TASK_OUTCOMES.has(outcome.kind))) {
			return {
				action: 'released',
				missingRecordIds: [],
				reason: 'claim lost to another owner',
				documents,
				requests,
			};
		}
		if (mine.length === 0) {
			// Our task was never scanned, so it was not RUNNABLE this tick. That covers several
			// states — completed inside its seed's dedupe window, failed and still inside its
			// retry backoff, claimed by another owner between our seed and our drain, or (the
			// pathological case) a persisted row no registered fetcher supports.
			//
			// All of them mean the same thing to the declarer: nothing of ours ran, so serve what
			// is already local. `released` would be wrong here — a UI binding re-declares on
			// every render, and a row that is never runnable (a stale unsupported task, or one
			// parked in a long backoff) would keep answering "not met" forever and hold readiness
			// barriers open. The old aggregate code effectively served local too; it just
			// mislabelled it `fetched` and claimed a fetch that never happened.
			return {
				action: 'serve-local',
				missingRecordIds: [],
				reason:
					input.seed.skippedCompleted > 0 ? input.freshReason : 'no task of ours ran this tick',
				documents: 0,
				requests: 0,
			};
		}
		return {
			action: 'fetched',
			missingRecordIds: [],
			reason: input.fetchedReason,
			documents,
			requests,
		};
	};

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
			// A reader, not a snapshot: a demand drain walks many pages and the
			// change-signal lane can publish a new carrier mid-walk (see
			// barcode-selectors). `ctx` takes the VALUE — its projections run
			// synchronously per chunk — so it re-reads at each use below.
			const barcodeSelectors: BarcodeSelectorsReader | undefined =
				deps.barcodeSelectorsFor === undefined
					? undefined
					: () => deps.barcodeSelectorsFor!(bound.scopeId) ?? undefined;
			const ctx = {
				database,
				fetch: boundFetch,
				syncBaseUrl: deps.syncBaseUrl,
				persistState: async () => undefined,
				log: (line: string) =>
					deps.diagnostics({ type: 'coverage.require.log', level: 'debug', message: line }),
				observe: deps.diagnostics,
				...(deps.pullBatchSize !== undefined ? { pullBatchSize: deps.pullBatchSize } : {}),
				...(barcodeSelectors !== undefined ? { barcodeSelectors } : {}),
			};

			// The ONE site that asserts the scope database into the scheduler's structural shape.
			// Both describe the same object; reconciling their types is the cycle this file
			// deliberately does not enter, so the assertion is made once and named.
			const schedulerDb = database as unknown as SchedulerDrainDatabase;
			const schedulerFetcher = boundFetch as never;

			/** One drain tick carrying the require-plane's invariant arguments. */
			const drainScheduler = (overrides: RequirementDrainOverrides = {}) =>
				runEngineSchedulerDrain({
					db: schedulerDb,
					coverage,
					baseUrl: deps.syncBaseUrl,
					ownerId: 'require-plane',
					...(barcodeSelectors !== undefined ? { barcodeSelectors } : {}),
					fetcher: schedulerFetcher,
					diagnostics: deps.diagnostics,
					...(deps.pullBatchSize !== undefined ? { pullBatchSize: deps.pullBatchSize } : {}),
					...(deps.censusFreshForMs !== undefined
						? { censusFreshForMs: deps.censusFreshForMs }
						: {}),
					...(deps.now !== undefined ? { nowMs: deps.now() } : {}),
					signal: item.abortController.signal,
					onProgress: progressObserver(item.requirement),
					...overrides,
				});

			/**
			 * Seed → drain → verdict, once, for every requirement kind that runs on the durable
			 * scheduler (the two browse windows, the orders query, the full order refresh, the
			 * on-demand reference lanes). Each of those used to re-implement this protocol inline,
			 * which is how the #956 invariant below came to be written five times — and how a branch
			 * could quietly be written a sixth time without it.
			 *
			 * The order of the verdicts is itself the contract:
			 *  1. a dropped guarded write means the scope moved mid-tick — nothing is trustworthy;
			 *  2. an ACTIVE lane means another owner is mid-pull — release, do not report met;
			 *  3. a COMPLETED lane inside the dedupe window (reference lanes only) is genuinely
			 *     fresh — serve local without draining;
			 *  4. a ledger rebuild (#956) aborted the tick — nothing was claimed and nothing was
			 *     fetched, so release rather than report the requirement met;
			 *  5. only then is the drain readable, and only through OUR seeded task ids.
			 */
			const runSeedDrain = async (spec: SeedDrainRequirement): Promise<CoverageOutcome> => {
				let drainResult = emptyDrainResult();
				let seedOutcome = emptySeedResult();
				let skippedActive = false;
				let deduped = false;
				const applied = await bound.guardWrite(async () => {
					const tick = await spec.seed();
					seedOutcome = tick.seed;
					// `skippedActive` and `skippedCompleted` are NOT the same answer. An active lane
					// means another owner is mid-pull, which releases this caller. Only a completed
					// lane inside a dedupe window is a genuine "your data is already fresh".
					if (tick.seed.skippedActive > 0) {
						skippedActive = true;
						return;
					}
					if (spec.dedupedReason !== undefined && tick.seed.skippedCompleted > 0) {
						deduped = true;
						return;
					}
					drainResult = await drainScheduler({ ...spec.drain, ...tick.drain });
				});
				if (applied === 'dropped') throw new Error(spec.droppedMessage);
				if (skippedActive)
					return {
						action: 'released',
						missingRecordIds: [],
						reason: spec.activeReason,
					};
				if (deduped && spec.dedupedReason !== undefined) {
					return {
						action: 'serve-local',
						missingRecordIds: [],
						reason: spec.dedupedReason,
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
				return requirementDrainOutcome({
					drain: drainResult,
					seed: seedOutcome,
					fetchedReason: spec.fetchedReason,
					freshReason: spec.freshReason,
				});
			};

			if (item.requirement.collection === 'orders' && item.requirement.kind === 'query') {
				// Captured here: the guardWrite closure below loses this narrowing.
				const browseQueryKey = item.requirement.queryKey;
				const decision = parseOrderBrowserSchedulerDescriptor(item.requirement.queryKey ?? '');
				if (!decision || 'skipReason' in decision) {
					throw new Error(
						`require: unsupported order query (${decision?.skipReason ?? 'missing queryKey'})`
					);
				}
				return runSeedDrain({
					seed: async () => ({
						seed: await seedOrderFilterSchedulerTask({
							...decision.descriptor,
							completedDedupeForMs: item.requirement.forceRefresh ? 0 : undefined,
							database: database,
						}),
					}),
					// An explicit user sync must re-walk THIS window from page 1; without it the
					// scroll continuation (#948/#957) would serve it straight back from coverage.
					// Scoped to the one lane key so a drain's other queued windows keep theirs.
					...(item.requirement.forceRefresh
						? { drain: { refreshBrowseWindowKey: browseQueryKey } }
						: {}),
					droppedMessage: 'require: scope moved mid-query (writes dropped)',
					activeReason: 'order query refresh already in progress',
					fetchedReason: `drained order query ${decision.descriptor.queryKey}`,
					freshReason: 'order query refreshed within the dedupe window',
				});
			}

			if (item.requirement.collection === 'products' && item.requirement.kind === 'query') {
				// The products BROWSE WINDOW (ADR 0027 §2, #909). Same durable shape as the
				// orders query above: seed the windowed task, drain it. This is what makes the
				// grid's own limit and sort reach the wire — before it existed, an empty-selector
				// products browse declared no demand at all, so infinite scroll past the cold
				// 100-row seed fetched nothing and a sort change re-sorted the wrong local slice.
				// Captured here: the guardWrite closure below loses this narrowing.
				const browseQueryKey = item.requirement.queryKey;
				const browseWindow = parseProductBrowseWindowDescriptor(item.requirement.queryKey ?? '');
				if (!browseWindow) {
					throw new Error(
						`require: unsupported product query (${item.requirement.queryKey ?? 'missing queryKey'})`
					);
				}
				return runSeedDrain({
					seed: async () => ({
						seed: await seedProductBrowseWindowSchedulerTask({
							// Spread the WHOLE descriptor, as the orders branch above does. Cherry-picking
							// limit/orderby/order silently dropped every filter dimension: the seeder then
							// rebuilt an UNFILTERED key, so filtered demand could never reach the wire and
							// its coverage lane collided with the unfiltered window's.
							...browseWindow,
							priority: item.priority,
							...(item.requirement.forceRefresh ? { completedDedupeForMs: 0 } : {}),
							database: database,
						}),
					}),
					// An explicit user sync must re-walk THIS window from page 1; without it the
					// scroll continuation (#948/#957) would serve it straight back from coverage.
					// Scoped to the one lane key so a drain's other queued windows keep theirs.
					...(item.requirement.forceRefresh
						? { drain: { refreshBrowseWindowKey: browseQueryKey } }
						: {}),
					droppedMessage: 'require: scope moved mid-query (writes dropped)',
					activeReason: 'product browse window already in progress',
					fetchedReason: `drained product browse window ${item.requirement.queryKey}`,
					freshReason: 'product browse window refreshed within the dedupe window',
				});
			}

			if (item.requirement.collection === 'customers' && item.requirement.kind === 'query') {
				// The customers BROWSE WINDOW (#951) — same durable shape as the products window
				// above. This is what makes a SORTED customers grid reach the wire: before it
				// existed, a customers browse declared no demand at all, so sorting by anything
				// re-ordered whichever residents the idle trickle happened to have walked to.
				const browseQueryKey = item.requirement.queryKey ?? '';
				const browseWindow = parseCustomerBrowseWindowDescriptor(browseQueryKey);
				if (!browseWindow) {
					throw new Error(
						`require: unsupported customer query (${item.requirement.queryKey ?? 'missing queryKey'})`
					);
				}
				return runSeedDrain({
					seed: async () => ({
						seed: await seedCustomerBrowseWindowSchedulerTask({
							...browseWindow,
							priority: item.priority,
							...(item.requirement.forceRefresh ? { completedDedupeForMs: 0 } : {}),
							database: database,
						}),
					}),
					// Work ISOLATION, orthogonal to outcome purity: the customers browse drains
					// only its own row, so a foreground grid never drags an unrelated lane onto
					// the wire. Per-task outcomes make the VERDICT correct for every lane; this
					// keeps the customers path from doing other lanes' work at all. The other
					// sites still drain opportunistically — generalizing this is a separate
					// throughput decision, not a correctness one.
					drain: { taskId: `${browseQueryKey}:windowed` },
					droppedMessage: 'require: scope moved mid-query (writes dropped)',
					activeReason: 'customer browse window already in progress',
					fetchedReason: `drained customer browse window ${item.requirement.queryKey}`,
					freshReason: 'customer browse window refreshed within the dedupe window',
				});
			}

			if (item.requirement.collection === 'orders' && item.requirement.kind === 'refresh') {
				const refreshRequirement = item.requirement;
				return runSeedDrain({
					seed: async () => ({
						seed: await seedOrderSchedulerTasks({
							perPage: refreshRequirement.limit ?? 250,
							priority: item.priority,
							completedDedupeForMs: item.requirement.forceRefresh ? 0 : undefined,
							database: database,
						}),
					}),
					// The explicit full refresh runs its tasks to completion instead of taking the
					// bounded per-task request budget a background drain keeps.
					drain: { maxRequestsPerTask: Number.POSITIVE_INFINITY },
					droppedMessage: 'require: scope moved mid-refresh (writes dropped)',
					activeReason: 'full order refresh already in progress',
					fetchedReason: 'drained full order refresh',
					freshReason: 'order refresh completed within the dedupe window',
				});
			}

			// On-demand reference pull (#952). Categories/tags/brands/coupons are no longer
			// seeded at boot; the mounted picker/screen/cart binding that needs one declares a
			// `refresh` and the greedy lane runs HERE, at open. `REFERENCE_REFRESH_DEDUPE_MS`
			// collapses a remount (or a second surface over the same collection) into the one
			// pull, so repeated opens cost nothing until the window lapses.
			if (item.requirement.kind === 'refresh' && descriptor.shape === 'greedy-prunable') {
				return runSeedDrain({
					seed: async () => {
						// One clock reading for BOTH halves of the tick: the dedupe window the seed
						// measures and the runnability the drain measures must agree.
						const nowMs = deps.now?.();
						return {
							seed: await seedReferenceLanes({
								collections: [descriptor.collection],
								completedDedupeForMs: item.requirement.forceRefresh
									? 0
									: REFERENCE_REFRESH_DEDUPE_MS,
								database: database,
								...(nowMs !== undefined ? { nowMs } : {}),
							}),
							...(nowMs !== undefined ? { drain: { nowMs } } : {}),
						};
					},
					droppedMessage: 'require: scope moved mid-refresh (writes dropped)',
					activeReason: `${descriptor.collection} refresh already in progress`,
					dedupedReason: `${descriptor.collection} refreshed within the dedupe window`,
					fetchedReason: `drained ${descriptor.collection} refresh`,
					freshReason: `${descriptor.collection} refreshed within the dedupe window`,
				});
			}

			if (item.requirement.kind === 'search') {
				// Products/customers/variations search is UI-anchored (#473): construct the same FetchTask shape
				// in memory and invoke only its registered fetcher. It never enters durable scheduler
				// state, so a periodic drain cannot reclaim it after the declarers release it.
				const searchCollection = item.requirement.collection;
				if (!['products', 'customers', 'variations'].includes(searchCollection)) {
					throw new Error(
						`require: 'search' supports products/customers/variations; "${searchCollection}" is unsupported`
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
					searchCollection === 'customers'
						? `customers:search=${encodedTerm}:limit=${limit}`
						: `${searchCollection}:search:${encodedTerm}`;
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
					} else if (
						searchCollection === 'customers' &&
						(await deps.customerSearchCatalogComplete?.())
					) {
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
						db: schedulerDb,
						coverage,
						baseUrl: deps.syncBaseUrl,
						fetcher: schedulerFetcher,
						...(deps.pullBatchSize !== undefined ? { pullBatchSize: deps.pullBatchSize } : {}),
						signal: item.abortController.signal,
						task,
						onProgress: progressObserver(item.requirement),
						...(barcodeSelectors !== undefined ? { barcodeSelectors } : {}),
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
				//
				// This one does NOT go through `runSeedDrain`, deliberately: its verdict is
				// RESIDENCY, not the drain tick. It re-checks the records after every tick,
				// waits out another owner's active claim with a bounded backoff instead of
				// releasing on it, and reports the ids it pulled — so it shares the drain
				// arguments (`drainScheduler`) and nothing else.
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
						const ownedTaskIds = new Set(seedResult.taskIds);
						const drainResult = await drainScheduler({ nowMs });
						// Only OUR targeted tasks count: an unrelated collection failing in the same
						// tick must not abort a pull whose own tasks are fine.
						failed = drainResult.tasks.filter(
							(outcome) => ownedTaskIds.has(outcome.taskId) && outcome.kind === 'failed'
						).length;
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
			// The runaway backstop is the ONE ceiling left on a browse window (#948/#957),
			// and it must never behave like the caps it replaced: it is announced, not
			// swallowed, so a window that stops growing is legible in the logs as well as in
			// the grid's footer count (which stops climbing with it).
			if (
				(requirement.kind === 'orders-browse' || requirement.kind === 'product-browse') &&
				typeof requirement.limit === 'number' &&
				requirement.limit > BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT
			) {
				deps.diagnostics({
					type: 'browse-window.backstop-reached',
					level: 'warn',
					collection: requirement.collection,
					message: `Browse window clamped to the ${BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT}-row runaway backstop (asked for ${requirement.limit})`,
					fields: { requirementId: requirement.id, requested: requirement.limit },
				});
			}
			const queryKey = (() => {
				if (requirement.kind === 'orders-browse') return orderBrowserQueryKey(requirement);
				if (requirement.kind === 'product-browse') {
					return productBrowseWindowQueryKeyFromDimensions(requirement);
				}
				if (requirement.kind === 'customer-browse') {
					return customerBrowseWindowQueryKeyFromDimensions(requirement);
				}
				if (requirement.kind === 'refresh') return laneKeyFor(requirement.collection);
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
				requirement.kind === 'orders-browse' ||
				requirement.kind === 'product-browse' ||
				requirement.kind === 'customer-browse'
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
