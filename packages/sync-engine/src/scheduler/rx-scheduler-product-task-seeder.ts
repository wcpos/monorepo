/**
 * Targeted PRODUCT scheduler-task seeder — the products mirror of
 * seedTargetedOrderSchedulerTask (rxOrderSchedulerTaskSeeder.ts). Both are now thin
 * descriptors over the shared `seedTargetedLane` template (rxTargetedLaneSeeder.ts);
 * only the collection, id label, key/requirement prefixes, doc-id format, and lane
 * defaults differ.
 *
 * The change-signal engine's product `idsToPull` reach the EXISTING `products:ids:`
 * scheduler lane through this seeder: it queues one (or, for large sets, several
 * schema-safe) on-demand task(s) keyed `products:ids:<ids>` with
 * `woo-product:<id>` document ids, which `rxOrderSchedulerTick` already routes to
 * `createProductsSchedulerFetcher` → `fetchTargetedProducts`
 * (wc/v3/products?include=<ids>&orderby=include). No engine change is needed in
 * the tick — the lane already exists; this seeder is the entry point.
 */

import {
	PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT,
	PRODUCT_BROWSE_WINDOW_MAX_LIMIT,
	PRODUCT_BROWSE_WINDOW_ORDER,
	PRODUCT_BROWSE_WINDOW_ORDERBY,
	type ProductBrowseWindowOrder,
	type ProductBrowseWindowOrderby,
	productBrowseWindowQueryKey,
} from './product-browse-window-descriptor';
import {
	emptySeedPersistedSchedulerTasksResult,
	seedPersistedSchedulerTasks,
	type SeedPersistedSchedulerTasksResult,
} from './rx-scheduler-task-seeder';
import { RxSchedulerTaskStateRepository } from './rx-scheduler-task-state-repository';
import { withSchedulerLedgerRecovery } from '../local-coverage/ledger-storage-recovery';
import { seedTargetedLane, type TargetedLaneDescriptor } from './rx-targeted-lane-seeder';

import type { SchedulerScopeResolver } from './scheduler-scope-resolver';

/** Default lane priority for the browse-window seed; the maintenance lane overrides it. */
const PRODUCT_BROWSE_WINDOW_SCHEDULER_PRIORITY = 500;
/** Re-seedable window: a completed task re-runs on the next lane tick past this dedupe. */
const PRODUCT_BROWSE_WINDOW_COMPLETED_DEDUPE_FOR_MS = 30_000;

const PRODUCT_TARGETED_LANE: TargetedLaneDescriptor = {
	collection: 'products',
	idLabel: 'product',
	keyPrefix: 'products',
	requirementPrefix: 'products',
	documentId: (id) => `woo-product:${id}`,
	defaultPriority: 900,
	defaultBatchSize: 100,
	defaultCompletedDedupeForMs: 30_000,
};

export type SeedTargetedProductSchedulerTaskInput = {
	productIds: number[];
	priority?: number;
	batchSize?: number;
	completedDedupeForMs?: number;
	nowMs?: number;
	getRepository: SchedulerScopeResolver;
};

export type SeedProductBrowseWindowSchedulerTaskInput = {
	/** Result-window size (rows the grid seeds, NOT a per-request size). Defaults to 100. */
	limit?: number;
	/** Wire sort for the window. Defaults to the POS catalog sort (menu_order asc). */
	orderby?: ProductBrowseWindowOrderby;
	order?: ProductBrowseWindowOrder;
	priority?: number;
	completedDedupeForMs?: number;
	nowMs?: number;
	getRepository: SchedulerScopeResolver;
};

/**
 * Seed the products browse-window task (ADR 0027 §2) — the products mirror of
 * seedOrderFilterSchedulerTask. One WINDOWED task keyed `products:browse-window:limit=<N>`
 * (plus `:orderby=…:order=…` for a non-default sort, #909), which the drain routes to
 * fetchProductBrowseWindow. Low priority (default 500 — below the Tier-0 reference lanes
 * and the orders window); NOT durable (a re-seedable refresh) and NOT filter-aware.
 *
 * The limit is a WINDOW, capped at PRODUCT_BROWSE_WINDOW_MAX_LIMIT — it may exceed a single
 * Woo page, because the fetcher walks the window in Performance-dial-sized pages (#908).
 */
export async function seedProductBrowseWindowSchedulerTask(
	input: SeedProductBrowseWindowSchedulerTaskInput
): Promise<SeedPersistedSchedulerTasksResult> {
	const limit = input.limit ?? PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT;
	if (!Number.isSafeInteger(limit) || limit <= 0 || limit > PRODUCT_BROWSE_WINDOW_MAX_LIMIT) {
		throw new Error(
			`Product browse-window scheduler limit must be a positive integer within the window ceiling (${PRODUCT_BROWSE_WINDOW_MAX_LIMIT})`
		);
	}
	const orderby = input.orderby ?? PRODUCT_BROWSE_WINDOW_ORDERBY;
	const order = input.order ?? PRODUCT_BROWSE_WINDOW_ORDER;
	const queryKey = productBrowseWindowQueryKey(limit, { orderby, order });
	const requirementId =
		queryKey === productBrowseWindowQueryKey(limit)
			? `products.browse-window.limit.${limit}`
			: `products.browse-window.limit.${limit}.${orderby}.${order}`;
	const repository = await input.getRepository();
	const database = repository.getDatabase();
	const nowMs = input.nowMs ?? Date.now();

	// A `schedulerTaskStates` reconciliation refusal rebuilds the derivable ledger
	// (#956); the seed then ends as a no-op — the tasks are re-seedable, so the next
	// cadence enqueues them again against the rebuilt store.
	return withSchedulerLedgerRecovery({
		database,
		aborted: emptySeedPersistedSchedulerTasksResult,
		run: () =>
			seedPersistedSchedulerTasks({
				repository: new RxSchedulerTaskStateRepository(database),
				tasks: [
					{
						id: `${queryKey}:windowed`,
						requirementId,
						collection: 'products',
						queryKey,
						limit,
						priority: input.priority ?? PRODUCT_BROWSE_WINDOW_SCHEDULER_PRIORITY,
						mode: 'windowed',
					},
				],
				nowMs,
				completedDedupeForMs:
					input.completedDedupeForMs ?? PRODUCT_BROWSE_WINDOW_COMPLETED_DEDUPE_FOR_MS,
			}),
	});
}

export async function seedTargetedProductSchedulerTask(
	input: SeedTargetedProductSchedulerTaskInput
): Promise<SeedPersistedSchedulerTasksResult> {
	return seedTargetedLane(PRODUCT_TARGETED_LANE, {
		ids: input.productIds,
		priority: input.priority,
		batchSize: input.batchSize,
		completedDedupeForMs: input.completedDedupeForMs,
		nowMs: input.nowMs,
		getRepository: input.getRepository,
		// This seeder IS the change-signal targeted product entry point, so an in-flight pull
		// re-seeded by a newer mutation must re-run rather than drop the change (#318).
		coalesceInFlight: true,
	});
}
