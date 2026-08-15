/**
 * Customers browse-window scheduler-task seeder (#951) — the customers sibling of
 * {@link seedProductBrowseWindowSchedulerTask}. One WINDOWED task keyed
 * `customers:browse-window:limit=<N>` (plus `:orderby=…:order=…` for a non-default sort),
 * which the drain routes to the customers fetcher's browse branch.
 *
 * The sort is part of the task's IDENTITY, not decoration: the fetcher re-parses this
 * queryKey to build the wire request, so each sort gets its own task id, requirementId and
 * coverage lane. That is what stops a `registered_date desc` window from being served out of
 * the `id asc` window's coverage — the "locally sorted slice of the wrong window" bug #951
 * reported.
 *
 * NOT durable in spirit: like the products window this is a re-seedable refresh, deduped for
 * {@link CUSTOMER_BROWSE_WINDOW_COMPLETED_DEDUPE_FOR_MS} so a remount or a second surface over
 * the same window costs nothing.
 */

import {
	CUSTOMER_BROWSE_WINDOW_DEFAULT_LIMIT,
	CUSTOMER_BROWSE_WINDOW_GRAMMAR,
	CUSTOMER_BROWSE_WINDOW_ORDER,
	CUSTOMER_BROWSE_WINDOW_ORDERBY,
	type CustomerBrowseWindowDescriptor,
	type CustomerBrowseWindowOrder,
	type CustomerBrowseWindowOrderby,
} from './customer-browse-window-descriptor';
import { type SeedPersistedSchedulerTasksResult } from './rx-scheduler-task-seeder';
import { type SchedulerTaskStateDatabase } from './rx-scheduler-task-state-repository';
import {
	type BrowseWindowLaneDescriptor,
	seedBrowseWindowLane,
} from './rx-browse-window-lane-seeder';

/**
 * The customers BROWSE lane over the shared seeder template (rxBrowseWindowLaneSeeder.ts).
 * Same interactive priority band as the products browse window — it is a mounted grid the
 * cashier is looking at, not background upkeep.
 */
const CUSTOMER_BROWSE_LANE: BrowseWindowLaneDescriptor<CustomerBrowseWindowDescriptor> = {
	grammar: CUSTOMER_BROWSE_WINDOW_GRAMMAR,
	defaultPriority: 500,
	defaultCompletedDedupeForMs: 30_000,
};

export type SeedCustomerBrowseWindowSchedulerTaskInput = {
	/** Result-window size (rows the grid seeds, NOT a per-request size — #908). Defaults to 100. */
	limit?: number;
	/** Wire sort for the window. Defaults to the trickle-aligned `id asc`. */
	orderby?: CustomerBrowseWindowOrderby;
	order?: CustomerBrowseWindowOrder;
	priority?: number;
	completedDedupeForMs?: number;
	nowMs?: number;
	database: SchedulerTaskStateDatabase;
};

export async function seedCustomerBrowseWindowSchedulerTask(
	input: SeedCustomerBrowseWindowSchedulerTaskInput
): Promise<SeedPersistedSchedulerTasksResult> {
	const limit = input.limit ?? CUSTOMER_BROWSE_WINDOW_DEFAULT_LIMIT;
	// No upper bound (R8): the window grows with the grid for as long as the cashier scrolls.
	// Only a non-integer or non-positive limit is a programming error worth refusing.
	if (!Number.isSafeInteger(limit) || limit <= 0) {
		throw new Error('Customer browse-window scheduler limit must be a positive integer');
	}
	const window: CustomerBrowseWindowDescriptor = {
		limit,
		orderby: input.orderby ?? CUSTOMER_BROWSE_WINDOW_ORDERBY,
		order: input.order ?? CUSTOMER_BROWSE_WINDOW_ORDER,
	};
	// An INPUT check, not a check on the encoder: an out-of-enum sort the caller supplied
	// would otherwise seed a task the fetcher then permanently refuses — and, since the
	// fetcher builds the wire request from this key, would be the one route by which a sort
	// wc/v3 cannot accept could reach the wire. (The encoder refuses those too, which is why
	// this parse is reached only for keys it agreed to build.)
	const queryKey = CUSTOMER_BROWSE_WINDOW_GRAMMAR.encode(window);
	if (CUSTOMER_BROWSE_WINDOW_GRAMMAR.parse(queryKey) === null) {
		throw new Error(`Customer browse-window scheduler descriptor is not supported: ${queryKey}`);
	}

	return seedBrowseWindowLane(CUSTOMER_BROWSE_LANE, {
		window,
		limit,
		mode: 'windowed',
		priority: input.priority,
		completedDedupeForMs: input.completedDedupeForMs,
		nowMs: input.nowMs,
		database: input.database,
	});
}
