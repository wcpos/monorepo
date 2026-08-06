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
import { parseOrderBrowserSchedulerDescriptor } from './order-browser-scheduler-descriptor';
import { seedTargetedLane, type TargetedLaneDescriptor } from './rx-targeted-lane-seeder';

const BACKGROUND_ORDER_SCHEDULER_PRIORITY = 100;
const BACKGROUND_ORDER_SCHEDULER_COMPLETED_DEDUPE_FOR_MS = 5 * 60_000;
const ORDER_FILTER_SCHEDULER_PRIORITY = 700;
const ORDER_FILTER_SCHEDULER_COMPLETED_DEDUPE_FOR_MS = 30_000;
const SCHEDULER_TASK_KEY_MAX_LENGTH = schedulerTaskStateSchema.properties.queryKey.maxLength;
const SCHEDULER_REQUIREMENT_ID_MAX_LENGTH =
	schedulerTaskStateSchema.properties.requirementId.maxLength;

/**
 * Targeted ORDER lane — the on-demand `orders:ids:<ids>` mirror of the product lane,
 * expressed as a descriptor over the shared `seedTargetedLane` template
 * (rxTargetedLaneSeeder.ts). The background custom-pull and browser-filter seeders
 * below are DIFFERENT shapes (a single greedy/windowed task, no id chunking) and
 * keep their own bodies.
 */
const ORDER_TARGETED_LANE: TargetedLaneDescriptor = {
	collection: 'orders',
	idLabel: 'order',
	keyPrefix: 'orders',
	requirementPrefix: 'orders',
	documentId: (id) => `woo-order:${id}`,
	defaultPriority: 900,
	defaultBatchSize: 100,
	defaultCompletedDedupeForMs: 30_000,
};

export type SeedOrderSchedulerTasksInput = {
	perPage: number;
	priority?: number;
	completedDedupeForMs?: number;
	nowMs?: number;
	database: SchedulerTaskStateDatabase;
};

export type SeedTargetedOrderSchedulerTaskInput = {
	orderIds: number[];
	priority?: number;
	batchSize?: number;
	completedDedupeForMs?: number;
	nowMs?: number;
	database: SchedulerTaskStateDatabase;
};

export type SeedOrderFilterSchedulerTaskInput = {
	status: string;
	search: string;
	limit: number;
	customerId?: number;
	cashierId?: number;
	store?: string;
	afterSeconds?: number;
	beforeSeconds?: number;
	orderby?: 'date' | 'modified' | 'id' | 'status' | 'customer_id' | 'payment_method' | 'total';
	order?: 'asc' | 'desc';
	complete?: boolean;
	priority?: number;
	completedDedupeForMs?: number;
	nowMs?: number;
	database: SchedulerTaskStateDatabase;
};

export async function seedOrderSchedulerTasks(
	input: SeedOrderSchedulerTasksInput
): Promise<SeedPersistedSchedulerTasksResult> {
	const nowMs = input.nowMs ?? Date.now();

	// A `schedulerTaskStates` reconciliation refusal rebuilds the derivable ledger
	// and the seed runs again against the fresh store (#956) — callers treat a
	// resolved seed as a durable enqueue, so it must not resolve empty.
	return withSchedulerSeedLedgerRecovery({
		database: input.database,
		run: () =>
			seedPersistedSchedulerTasks({
				repository: new RxSchedulerTaskStateRepository(input.database),
				tasks: [
					{
						id: 'orders:custom-pull:greedy',
						requirementId: 'orders.custom-pull.background',
						collection: 'orders',
						queryKey: 'orders:custom-pull',
						limit: input.perPage,
						priority: input.priority ?? BACKGROUND_ORDER_SCHEDULER_PRIORITY,
						mode: 'greedy',
					},
				],
				nowMs,
				completedDedupeForMs:
					input.completedDedupeForMs ?? BACKGROUND_ORDER_SCHEDULER_COMPLETED_DEDUPE_FOR_MS,
			}),
	});
}

function orderFilterDescriptor(input: SeedOrderFilterSchedulerTaskInput): {
	status: string;
	limit: number;
	queryKey: string;
	requirementId: string;
	/** Whether this is a fetch-to-completion (`limit=all`) range — it runs greedy. */
	complete: boolean;
} {
	if (!Number.isSafeInteger(input.limit) || input.limit <= 0) {
		throw new Error('Browser order scheduler descriptor limit must be a positive integer');
	}

	const status = input.status.trim() || 'all';
	const search = input.search.trim();
	// Structured dimensions (customer, cashier, store, the range bounds, then the sort pair)
	// precede `:search=` so arbitrary search text can never be read back as a filter or sort —
	// see the grammar note in order-browser-scheduler-descriptor.ts.
	const customerPart = input.customerId === undefined ? '' : `:customer=${input.customerId}`;
	const cashierPart = input.cashierId === undefined ? '' : `:cashier=${input.cashierId}`;
	const storePart = input.store === undefined ? '' : `:store=${input.store}`;
	const rangePart = `${
		input.afterSeconds === undefined ? '' : `:after=${input.afterSeconds}`
	}${input.beforeSeconds === undefined ? '' : `:before=${input.beforeSeconds}`}`;
	// Ranged (`limit=all`) lanes are sort-agnostic — see the sortPart note in
	// orderBrowserQueryKey, whose grammar this must stay byte-identical to.
	const sortPart = input.complete
		? ''
		: `${input.orderby === undefined ? '' : `:orderby=${input.orderby}`}${
				input.order === undefined ? '' : `:order=${input.order}`
			}`;
	const limitPart = input.complete ? 'all' : input.limit;
	const queryKey = `orders:browser:status=${status}${customerPart}${cashierPart}${storePart}${rangePart}${sortPart}:search=${search}:limit=${limitPart}`;
	const descriptorDecision = parseOrderBrowserSchedulerDescriptor(queryKey);
	if (!descriptorDecision || 'skipReason' in descriptorDecision) {
		throw new Error(
			descriptorDecision?.skipReason ?? 'Browser order scheduler descriptor is not supported'
		);
	}
	const { limit } = descriptorDecision.descriptor;
	const searchPart = search === '' ? '' : `.search.${search}`;
	const requirementId =
		customerPart || cashierPart || storePart || rangePart || sortPart
			? queryKey.replaceAll(':', '.')
			: `orders.browser.status.${status}${searchPart}.limit.${limitPart}`;
	if (queryKey.length > SCHEDULER_TASK_KEY_MAX_LENGTH) {
		throw new Error(
			`Browser order scheduler descriptor queryKey exceeds schema limit: ${queryKey.length} > ${SCHEDULER_TASK_KEY_MAX_LENGTH}`
		);
	}
	if (requirementId.length > SCHEDULER_REQUIREMENT_ID_MAX_LENGTH) {
		throw new Error(
			`Browser order scheduler descriptor requirementId exceeds schema limit: ${requirementId.length} > ${SCHEDULER_REQUIREMENT_ID_MAX_LENGTH}`
		);
	}

	return {
		status,
		limit,
		queryKey,
		requirementId,
		complete: Boolean(input.complete),
	};
}

export async function seedOrderFilterSchedulerTask(
	input: SeedOrderFilterSchedulerTaskInput
): Promise<SeedPersistedSchedulerTasksResult> {
	const descriptor = orderFilterDescriptor(input);
	const nowMs = input.nowMs ?? Date.now();

	// A `schedulerTaskStates` reconciliation refusal rebuilds the derivable ledger
	// and the seed runs again against the fresh store (#956) — callers treat a
	// resolved seed as a durable enqueue, so it must not resolve empty.
	return withSchedulerSeedLedgerRecovery({
		database: input.database,
		run: () =>
			seedPersistedSchedulerTasks({
				repository: new RxSchedulerTaskStateRepository(input.database),
				tasks: [
					{
						id: `${descriptor.queryKey}:windowed`,
						requirementId: descriptor.requirementId,
						collection: 'orders',
						queryKey: descriptor.queryKey,
						limit: descriptor.limit,
						priority: input.priority ?? ORDER_FILTER_SCHEDULER_PRIORITY,
						// A fetch-to-completion (`limit=all`) range is GREEDY: the runner keeps
						// calling the fetcher until it reports `completed`, renewing the claim between
						// passes. A windowed task gets exactly ONE fetch invocation
						// (`taskCompleted = task.mode !== 'greedy' || fetchResult.completed` in
						// rx-scheduler-task-runner.ts) and `useDemand` declares a requirement once, so
						// a ranged walk left windowed would stop after its first pass and the report
						// would stay permanently capped — the cursor would be persisted and never read
						// (#954). The per-pass record bound still applies; greedy just means the next
						// pass follows immediately instead of waiting for an unrelated re-declaration.
						mode: descriptor.complete ? 'greedy' : 'windowed',
					},
				],
				nowMs,
				completedDedupeForMs:
					input.completedDedupeForMs ?? ORDER_FILTER_SCHEDULER_COMPLETED_DEDUPE_FOR_MS,
			}),
	});
}

export async function seedTargetedOrderSchedulerTask(
	input: SeedTargetedOrderSchedulerTaskInput
): Promise<SeedPersistedSchedulerTasksResult> {
	return seedTargetedLane(ORDER_TARGETED_LANE, {
		ids: input.orderIds,
		priority: input.priority,
		batchSize: input.batchSize,
		completedDedupeForMs: input.completedDedupeForMs,
		nowMs: input.nowMs,
		database: input.database,
	});
}
