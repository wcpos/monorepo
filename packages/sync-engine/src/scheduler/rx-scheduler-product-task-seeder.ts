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

import { productDocumentId, type RemoteId } from '@wcpos/sync-core';

import {
	BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT,
	isBrowseWindowLimit,
} from './browse-window-continuation';
import {
	PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT,
	PRODUCT_BROWSE_WINDOW_GRAMMAR,
	PRODUCT_BROWSE_WINDOW_ORDER,
	PRODUCT_BROWSE_WINDOW_ORDERBY,
	type ProductBrowseWindowDescriptor,
	type ProductBrowseWindowFilters,
	type ProductBrowseWindowOrder,
	type ProductBrowseWindowOrderby,
} from './product-browse-window-descriptor';
import { type SeedPersistedSchedulerTasksResult } from './rx-scheduler-task-seeder';
import { type SchedulerTaskStateDatabase } from './rx-scheduler-task-state-repository';
import {
	type BrowseWindowLaneDescriptor,
	seedBrowseWindowLane,
} from './rx-browse-window-lane-seeder';
import { seedTargetedLane, type TargetedLaneDescriptor } from './rx-targeted-lane-seeder';

/**
 * The products BROWSE lane over the shared seeder template (rxBrowseWindowLaneSeeder.ts).
 * Low priority (below the Tier-0 reference lanes and the orders window); re-seedable rather
 * than durable, so a completed task re-runs on the next lane tick past the dedupe.
 */
const PRODUCT_BROWSE_LANE: BrowseWindowLaneDescriptor<ProductBrowseWindowDescriptor> = {
	grammar: PRODUCT_BROWSE_WINDOW_GRAMMAR,
	defaultPriority: 500,
	defaultCompletedDedupeForMs: 30_000,
};

const PRODUCT_TARGETED_LANE: TargetedLaneDescriptor = {
	collection: 'products',
	idLabel: 'product',
	keyPrefix: 'products',
	requirementPrefix: 'products',
	documentId: productDocumentId,
	defaultPriority: 900,
	defaultBatchSize: 100,
	defaultCompletedDedupeForMs: 30_000,
};

export type SeedTargetedProductSchedulerTaskInput = {
	remoteIds: RemoteId[];
	priority?: number;
	batchSize?: number;
	completedDedupeForMs?: number;
	nowMs?: number;
	database: SchedulerTaskStateDatabase;
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
	database: SchedulerTaskStateDatabase;
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
 * The limit is a WINDOW, not a request size: it may exceed a single Woo page, because the
 * fetcher walks the window in Performance-dial-sized pages (#908), and it has no product
 * ceiling (#948) — only the runaway backstop. Growth stays cheap because the fetcher
 * resumes each window from the covered prefix (browse-window-continuation.ts).
 */
export async function seedProductBrowseWindowSchedulerTask(
	input: SeedProductBrowseWindowSchedulerTaskInput
): Promise<SeedPersistedSchedulerTasksResult> {
	const limit = input.limit ?? PRODUCT_BROWSE_WINDOW_DEFAULT_LIMIT;
	if (!isBrowseWindowLimit(limit)) {
		throw new Error(
			`Product browse-window scheduler limit must be a positive integer within the runaway backstop (${BROWSE_WINDOW_ABSOLUTE_MAX_LIMIT})`
		);
	}
	const filters: ProductBrowseWindowFilters = {
		...(input.category ? { category: input.category } : {}),
		...(input.tag ? { tag: input.tag } : {}),
		...(input.brand ? { brand: input.brand } : {}),
		...(input.featured !== undefined ? { featured: input.featured } : {}),
		...(input.on_sale !== undefined ? { on_sale: input.on_sale } : {}),
		...(input.stock_status ? { stock_status: input.stock_status } : {}),
	};
	const window: ProductBrowseWindowDescriptor = {
		limit,
		orderby: input.orderby ?? PRODUCT_BROWSE_WINDOW_ORDERBY,
		order: input.order ?? PRODUCT_BROWSE_WINDOW_ORDER,
		...filters,
	};
	// An INPUT check, not a check on the encoder: a dimension the caller supplied that this
	// grammar cannot express (an out-of-enum sort, a non-canonical id list) would otherwise
	// seed a task the fetcher then permanently refuses.
	const queryKey = PRODUCT_BROWSE_WINDOW_GRAMMAR.encode(window);
	if (PRODUCT_BROWSE_WINDOW_GRAMMAR.parse(queryKey) === null) {
		throw new Error(`Product browse-window scheduler descriptor is not supported: ${queryKey}`);
	}

	return seedBrowseWindowLane(PRODUCT_BROWSE_LANE, {
		window,
		limit,
		mode: 'windowed',
		priority: input.priority,
		completedDedupeForMs: input.completedDedupeForMs,
		nowMs: input.nowMs,
		database: input.database,
	});
}

export async function seedTargetedProductSchedulerTask(
	input: SeedTargetedProductSchedulerTaskInput
): Promise<SeedPersistedSchedulerTasksResult> {
	return seedTargetedLane(PRODUCT_TARGETED_LANE, {
		remoteIds: input.remoteIds,
		priority: input.priority,
		batchSize: input.batchSize,
		completedDedupeForMs: input.completedDedupeForMs,
		nowMs: input.nowMs,
		database: input.database,
		// This seeder IS the change-signal targeted product entry point, so an in-flight pull
		// re-seeded by a newer mutation must re-run rather than drop the change (#318).
		coalesceInFlight: true,
	});
}
