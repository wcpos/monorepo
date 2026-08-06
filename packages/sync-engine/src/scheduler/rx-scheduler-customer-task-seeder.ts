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
	CUSTOMER_BROWSE_WINDOW_ORDER,
	CUSTOMER_BROWSE_WINDOW_ORDERBY,
	type CustomerBrowseWindowOrder,
	type CustomerBrowseWindowOrderby,
	customerBrowseWindowQueryKey,
	parseCustomerBrowseWindowDescriptor,
} from './customer-browse-window-descriptor';
import {
	seedPersistedSchedulerTasks,
	type SeedPersistedSchedulerTasksResult,
} from './rx-scheduler-task-seeder';
import {
	RxSchedulerTaskStateRepository,
	type SchedulerTaskStateDatabase,
} from './rx-scheduler-task-state-repository';
import { withSchedulerSeedLedgerRecovery } from '../local-coverage/ledger-storage-recovery';
import { schedulerTaskStateSchema } from './scheduler-task-state-schema';

const SCHEDULER_TASK_KEY_MAX_LENGTH = schedulerTaskStateSchema.properties.queryKey.maxLength;
const SCHEDULER_REQUIREMENT_ID_MAX_LENGTH =
	schedulerTaskStateSchema.properties.requirementId.maxLength;

/**
 * Default lane priority. Customers browse sits in the same interactive band as the products
 * browse window — it is a mounted grid the cashier is looking at, not background upkeep.
 */
const CUSTOMER_BROWSE_WINDOW_SCHEDULER_PRIORITY = 500;
/** Re-seedable window: a completed task re-runs on the next declaration past this dedupe. */
const CUSTOMER_BROWSE_WINDOW_COMPLETED_DEDUPE_FOR_MS = 30_000;

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
	const orderby = input.orderby ?? CUSTOMER_BROWSE_WINDOW_ORDERBY;
	const order = input.order ?? CUSTOMER_BROWSE_WINDOW_ORDER;
	const queryKey = customerBrowseWindowQueryKey(limit, { orderby, order });
	// Round-trip through the authoritative parser, as the products seeder does: a key this
	// encoder can build but that parser rejects would seed a task the fetcher then refuses.
	if (parseCustomerBrowseWindowDescriptor(queryKey) === null) {
		throw new Error(`Customer browse-window scheduler descriptor is not supported: ${queryKey}`);
	}
	const sortSuffix = queryKey === customerBrowseWindowQueryKey(limit) ? '' : `.${orderby}.${order}`;
	const requirementId = `customers.browse-window.limit.${limit}${sortSuffix}`;
	// An uncapped window makes the key length input-dependent. A key over the persisted
	// schema's ceiling would fail deep inside RxDB validation; reject it here, as the
	// products seeder does. `require()` rejections are swallowed by declareRequirements, so
	// this degrades to no remote demand rather than breaking the grid.
	if (`${queryKey}:windowed`.length > SCHEDULER_TASK_KEY_MAX_LENGTH) {
		throw new Error(
			`Customer browse-window scheduler queryKey exceeds schema limit: ${queryKey.length} > ${SCHEDULER_TASK_KEY_MAX_LENGTH}`
		);
	}
	if (requirementId.length > SCHEDULER_REQUIREMENT_ID_MAX_LENGTH) {
		throw new Error(
			`Customer browse-window scheduler requirementId exceeds schema limit: ${requirementId.length} > ${SCHEDULER_REQUIREMENT_ID_MAX_LENGTH}`
		);
	}
	const nowMs = input.nowMs ?? Date.now();

	// A `schedulerTaskStates` reconciliation refusal rebuilds the derivable ledger and the
	// seed runs again against the fresh store (#956) — callers treat a resolved seed as a
	// durable enqueue, so it must not resolve empty.
	return withSchedulerSeedLedgerRecovery({
		database: input.database,
		run: () =>
			seedPersistedSchedulerTasks({
				repository: new RxSchedulerTaskStateRepository(input.database),
				tasks: [
					{
						id: `${queryKey}:windowed`,
						requirementId,
						collection: 'customers',
						queryKey,
						limit,
						priority: input.priority ?? CUSTOMER_BROWSE_WINDOW_SCHEDULER_PRIORITY,
						mode: 'windowed',
					},
				],
				nowMs,
				completedDedupeForMs:
					input.completedDedupeForMs ?? CUSTOMER_BROWSE_WINDOW_COMPLETED_DEDUPE_FOR_MS,
			}),
	});
}
