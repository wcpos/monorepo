import {
	seedPersistedSchedulerTasks,
	type SeedPersistedSchedulerTasksResult,
} from './rx-scheduler-task-seeder';
import { RxSchedulerTaskStateRepository } from './rx-scheduler-task-state-repository';
import { schedulerTaskStateSchema } from './scheduler-task-state-schema';
import { parseOrderBrowserSchedulerDescriptor } from './order-browser-scheduler-descriptor';
import { seedTargetedLane, type TargetedLaneDescriptor } from './rx-targeted-lane-seeder';

import type { SchedulerScopeResolver } from './scheduler-scope-resolver';

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
	getRepository: SchedulerScopeResolver;
};

export type SeedTargetedOrderSchedulerTaskInput = {
	orderIds: number[];
	priority?: number;
	batchSize?: number;
	completedDedupeForMs?: number;
	nowMs?: number;
	getRepository: SchedulerScopeResolver;
};

export type SeedOrderFilterSchedulerTaskInput = {
	status: string;
	search: string;
	limit: number;
	priority?: number;
	completedDedupeForMs?: number;
	nowMs?: number;
	getRepository: SchedulerScopeResolver;
};

export async function seedOrderSchedulerTasks(
	input: SeedOrderSchedulerTasksInput
): Promise<SeedPersistedSchedulerTasksResult> {
	const repository = await input.getRepository();
	const schedulerRepository = new RxSchedulerTaskStateRepository(repository.getDatabase());
	const nowMs = input.nowMs ?? Date.now();

	return seedPersistedSchedulerTasks({
		repository: schedulerRepository,
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
	});
}

function orderFilterDescriptor(input: SeedOrderFilterSchedulerTaskInput): {
	status: string;
	limit: number;
	queryKey: string;
	requirementId: string;
} {
	if (!Number.isSafeInteger(input.limit) || input.limit <= 0) {
		throw new Error('Browser order scheduler descriptor limit must be a positive integer');
	}

	const status = input.status.trim() || 'all';
	const search = input.search.trim();
	const queryKey = `orders:browser:status=${status}:search=${search}:limit=${input.limit}`;
	const descriptorDecision = parseOrderBrowserSchedulerDescriptor(queryKey);
	if (!descriptorDecision || 'skipReason' in descriptorDecision) {
		throw new Error(
			descriptorDecision?.skipReason ?? 'Browser order scheduler descriptor is not supported'
		);
	}
	const { limit } = descriptorDecision.descriptor;
	const searchPart = search === '' ? '' : `.search.${search}`;
	const requirementId = `orders.browser.status.${status}${searchPart}.limit.${input.limit}`;
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
	};
}

export async function seedOrderFilterSchedulerTask(
	input: SeedOrderFilterSchedulerTaskInput
): Promise<SeedPersistedSchedulerTasksResult> {
	const descriptor = orderFilterDescriptor(input);
	const repository = await input.getRepository();
	const schedulerRepository = new RxSchedulerTaskStateRepository(repository.getDatabase());
	const nowMs = input.nowMs ?? Date.now();

	return seedPersistedSchedulerTasks({
		repository: schedulerRepository,
		tasks: [
			{
				id: `${descriptor.queryKey}:windowed`,
				requirementId: descriptor.requirementId,
				collection: 'orders',
				queryKey: descriptor.queryKey,
				limit: descriptor.limit,
				priority: input.priority ?? ORDER_FILTER_SCHEDULER_PRIORITY,
				mode: 'windowed',
			},
		],
		nowMs,
		completedDedupeForMs:
			input.completedDedupeForMs ?? ORDER_FILTER_SCHEDULER_COMPLETED_DEDUPE_FOR_MS,
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
		getRepository: input.getRepository,
	});
}
