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
	parseProductBrowseWindowDescriptor,
	PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT,
	PRODUCT_BROWSE_WINDOW_MAX_LIMIT,
	PRODUCT_BROWSE_WINDOW_ORDER,
	PRODUCT_BROWSE_WINDOW_ORDERBY,
	productBrowseWindowFilterPart,
	type ProductBrowseWindowFilters,
	type ProductBrowseWindowOrder,
	type ProductBrowseWindowOrderby,
	productBrowseWindowQueryKey,
} from './product-browse-window-descriptor';
import {
	seedPersistedSchedulerTasks,
	type SeedPersistedSchedulerTasksResult,
} from './rx-scheduler-task-seeder';
import { RxSchedulerTaskStateRepository } from './rx-scheduler-task-state-repository';
import { seedTargetedLane, type TargetedLaneDescriptor } from './rx-targeted-lane-seeder';
import { schedulerTaskStateSchema } from './scheduler-task-state-schema';

import type { SchedulerScopeResolver } from './scheduler-scope-resolver';

const SCHEDULER_TASK_KEY_MAX_LENGTH = schedulerTaskStateSchema.properties.queryKey.maxLength;
const SCHEDULER_REQUIREMENT_ID_MAX_LENGTH =
	schedulerTaskStateSchema.properties.requirementId.maxLength;

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

export type SeedProductBrowseWindowSchedulerTaskInput = ProductBrowseWindowFilters & {
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
 * (plus `:orderby=…:order=…` for a non-default sort, #909, and the representable filter
 * dimensions, 2026-08-04 ruling), which the drain routes to fetchProductBrowseWindow. Low
 * priority (default 500 — below the Tier-0 reference lanes and the orders window); NOT
 * durable (a re-seedable refresh).
 *
 * The filters are part of the task's IDENTITY, not decoration: the fetcher re-parses this
 * queryKey to build the wire request, so a dimension dropped here never reaches the wire and
 * the filtered demand that asked for it can never be satisfied. Each filter set therefore
 * gets its own task id, requirementId and coverage lane.
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
	const filters: ProductBrowseWindowFilters = {
		...(input.category ? { category: input.category } : {}),
		...(input.tag ? { tag: input.tag } : {}),
		...(input.brand ? { brand: input.brand } : {}),
		...(input.featured !== undefined ? { featured: input.featured } : {}),
		...(input.on_sale !== undefined ? { on_sale: input.on_sale } : {}),
		...(input.stock_status ? { stock_status: input.stock_status } : {}),
	};
	const queryKey = productBrowseWindowQueryKey(limit, { orderby, order }, filters);
	// Round-trip through the authoritative parser, as the orders seeder does: a key this
	// encoder can build but that parser rejects would seed a task the fetcher then refuses.
	if (parseProductBrowseWindowDescriptor(queryKey) === null) {
		throw new Error(`Product browse-window scheduler descriptor is not supported: ${queryKey}`);
	}
	const filterPart = productBrowseWindowFilterPart(filters);
	const sortSuffix =
		queryKey === productBrowseWindowQueryKey(limit, undefined, filters)
			? ''
			: `.${orderby}.${order}`;
	const requirementId = `products.browse-window.limit.${limit}${sortSuffix}${filterPart.replaceAll(':', '.')}`;
	// Filter id lists make the key unbounded, unlike the pre-filter window. A key over the
	// persisted schema's ceiling would fail deep inside RxDB validation; reject it here, as
	// the orders seeder does. `require()` rejections are swallowed by declareRequirements, so
	// an over-long filter set degrades to no remote demand rather than breaking the grid.
	if (`${queryKey}:windowed`.length > SCHEDULER_TASK_KEY_MAX_LENGTH) {
		throw new Error(
			`Product browse-window scheduler queryKey exceeds schema limit: ${queryKey.length} > ${SCHEDULER_TASK_KEY_MAX_LENGTH}`
		);
	}
	if (requirementId.length > SCHEDULER_REQUIREMENT_ID_MAX_LENGTH) {
		throw new Error(
			`Product browse-window scheduler requirementId exceeds schema limit: ${requirementId.length} > ${SCHEDULER_REQUIREMENT_ID_MAX_LENGTH}`
		);
	}
	const repository = await input.getRepository();
	const schedulerRepository = new RxSchedulerTaskStateRepository(repository.getDatabase());
	const nowMs = input.nowMs ?? Date.now();

	return seedPersistedSchedulerTasks({
		repository: schedulerRepository,
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
