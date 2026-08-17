import { orderDocumentId, type RemoteId } from '@wcpos/sync-core';

import {
	seedPersistedSchedulerTasks,
	type SeedPersistedSchedulerTasksResult,
} from './rx-scheduler-task-seeder';
import {
	RxSchedulerTaskStateRepository,
	type SchedulerTaskStateDatabase,
} from './rx-scheduler-task-state-repository';
import { withSchedulerSeedLedgerRecovery } from '../local-coverage/ledger-storage-recovery';
import {
	ORDER_BROWSE_WINDOW_GRAMMAR,
	type OrderBrowseWindowFields,
	parseOrderBrowserSchedulerDescriptor,
} from './order-browser-scheduler-descriptor';
import {
	type BrowseWindowLaneDescriptor,
	seedBrowseWindowLane,
} from './rx-browse-window-lane-seeder';
import { seedTargetedLane, type TargetedLaneDescriptor } from './rx-targeted-lane-seeder';

const BACKGROUND_ORDER_SCHEDULER_PRIORITY = 100;
const BACKGROUND_ORDER_SCHEDULER_COMPLETED_DEDUPE_FOR_MS = 5 * 60_000;

/** The orders BROWSE lane over the shared seeder template (rxBrowseWindowLaneSeeder.ts). */
const ORDER_BROWSE_LANE: BrowseWindowLaneDescriptor<OrderBrowseWindowFields> = {
	grammar: ORDER_BROWSE_WINDOW_GRAMMAR,
	defaultPriority: 700,
	defaultCompletedDedupeForMs: 30_000,
};

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
	documentId: orderDocumentId,
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
	remoteIds: RemoteId[];
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

/**
 * Validate the caller's dimensions and hand them to the shared browse-window seeder.
 *
 * This seeder does NOT quantize: `limit` travels verbatim (the demand plane already put it
 * on the growth curve, and a Reports range asks for the rows it asks for). The parse below
 * is an INPUT check, not a check on the encoder — there is only one encoder now, and it
 * lives in the grammar beside this parser. What is still worth refusing here is a
 * dimension the caller supplied that this grammar cannot express: a
 * status carrying a `:`, a non-integer customer id, a store id outside the id charset, half
 * a sort pair, or a `limit=all` with no date bound. Left through, each would seed a task the
 * drain permanently refuses.
 */
function orderFilterWindow(input: SeedOrderFilterSchedulerTaskInput): {
	window: OrderBrowseWindowFields;
	limit: number;
	complete: boolean;
} {
	if (!Number.isSafeInteger(input.limit) || input.limit <= 0) {
		throw new Error('Browser order scheduler descriptor limit must be a positive integer');
	}

	const window: OrderBrowseWindowFields = {
		status: input.status.trim() || 'all',
		search: input.search.trim(),
		limit: input.complete ? 'all' : input.limit,
		customerId: input.customerId,
		cashierId: input.cashierId,
		store: input.store,
		afterSeconds: input.afterSeconds,
		beforeSeconds: input.beforeSeconds,
		orderby: input.orderby,
		order: input.order,
	};
	const decision = parseOrderBrowserSchedulerDescriptor(ORDER_BROWSE_WINDOW_GRAMMAR.encode(window));
	if (!decision?.descriptor) {
		throw new Error(decision?.skipReason ?? 'Browser order scheduler descriptor is not supported');
	}

	// A ranged lane's task limit is its PER-PASS record ceiling, which the parser supplies;
	// a windowed lane's is the window itself.
	return { window, limit: decision.descriptor.limit, complete: Boolean(input.complete) };
}

export async function seedOrderFilterSchedulerTask(
	input: SeedOrderFilterSchedulerTaskInput
): Promise<SeedPersistedSchedulerTasksResult> {
	const { window, limit, complete } = orderFilterWindow(input);

	return seedBrowseWindowLane(ORDER_BROWSE_LANE, {
		window,
		limit,
		// A fetch-to-completion (`limit=all`) range is GREEDY: the runner keeps calling the
		// fetcher until it reports `completed`, renewing the claim between passes. A windowed
		// task gets exactly ONE fetch invocation (`taskCompleted = task.mode !== 'greedy' ||
		// fetchResult.completed` in rx-scheduler-task-runner.ts) and `useDemand` declares a
		// requirement once, so a ranged walk left windowed would stop after its first pass and
		// the report would stay permanently capped — the cursor would be persisted and never
		// read (#954). The per-pass record bound still applies; greedy just means the next pass
		// follows immediately instead of waiting for an unrelated re-declaration.
		mode: complete ? 'greedy' : 'windowed',
		priority: input.priority,
		completedDedupeForMs: input.completedDedupeForMs,
		nowMs: input.nowMs,
		database: input.database,
	});
}

export async function seedTargetedOrderSchedulerTask(
	input: SeedTargetedOrderSchedulerTaskInput
): Promise<SeedPersistedSchedulerTasksResult> {
	return seedTargetedLane(ORDER_TARGETED_LANE, {
		remoteIds: input.remoteIds,
		priority: input.priority,
		batchSize: input.batchSize,
		completedDedupeForMs: input.completedDedupeForMs,
		nowMs: input.nowMs,
		database: input.database,
	});
}
