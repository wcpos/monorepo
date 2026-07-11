import type { ConnectivityMode, FetchTask, FetchTaskResult, ReplicationRequirement, SchedulerRunResult } from './replication-policy';

export type SchedulerFetcherContext = { signal?: AbortSignal };

export type SchedulerFetcher = (task: FetchTask, context?: SchedulerFetcherContext) => Promise<FetchTaskResult>;

export type SchedulerTaskPlanInput = {
  connectivity: ConnectivityMode;
  requirements: ReplicationRequirement[];
};

export type SchedulerTaskPlan = {
  tasks: FetchTask[];
  skipped: SchedulerRunResult['skipped'];
};

export type SchedulerScenarioInput = SchedulerTaskPlanInput & {
  fetcher: SchedulerFetcher;
  signal?: AbortSignal;
};

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new Error('Scheduler run aborted');
}

function taskId(requirement: ReplicationRequirement): string {
  const idsPart = requirement.kind === 'targeted-records' && requirement.ids?.length
    ? `:${[...requirement.ids].sort().join(',')}`
    : '';
  return `${requirement.collection}:${requirement.queryKey}:${requirement.policy.mode}${idsPart}`;
}

function toTask(requirement: ReplicationRequirement): FetchTask {
  return {
    id: taskId(requirement),
    requirementId: requirement.id,
    collection: requirement.collection,
    queryKey: requirement.queryKey,
    ids: requirement.ids,
    wooIds: requirement.wooIds,
    limit: requirement.policy.batchSize,
    priority: requirement.policy.priority,
    mode: requirement.policy.mode,
  };
}

function shouldSkipOffline(connectivity: ConnectivityMode, requirement: ReplicationRequirement): string | null {
  if (connectivity === 'online' || connectivity === 'degraded') return null;
  if (requirement.policy.offline.read === 'serve-local') return 'offline: served local data only';
  if (requirement.policy.offline.read === 'fail-if-missing') return 'offline: required remote data is unavailable';
  return 'offline: fresh remote data required';
}

export function planSchedulerTasks(input: SchedulerTaskPlanInput): SchedulerTaskPlan {
  const skipped: SchedulerRunResult['skipped'] = [];
  const tasksById = new Map<string, FetchTask>();

  for (const requirement of input.requirements) {
    const skipReason = shouldSkipOffline(input.connectivity, requirement);
    if (skipReason) {
      skipped.push({ requirementId: requirement.id, reason: skipReason });
      continue;
    }
    const task = toTask(requirement);
    const existing = tasksById.get(task.id);
    if (!existing || task.priority > existing.priority) {
      tasksById.set(task.id, task);
    }
  }

  return {
    tasks: [...tasksById.values()].sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id)),
    skipped,
  };
}

export async function runSchedulerScenario(input: SchedulerScenarioInput): Promise<SchedulerRunResult> {
  const { tasks, skipped } = planSchedulerTasks(input);
  const results: FetchTaskResult[] = [];

  for (const task of tasks) {
    throwIfAborted(input.signal);
    const maxRequests = input.requirements.find((requirement) => requirement.id === task.requirementId)?.policy.maxRequests ?? 100;
    let completed = false;
    let attempts = 0;

    while (!completed) {
      throwIfAborted(input.signal);
      attempts += 1;
      const result = input.signal
        ? await input.fetcher(task, { signal: input.signal })
        : await input.fetcher(task);
      results.push(result);
      completed = task.mode !== 'greedy' || result.completed;

      if (!completed && attempts >= maxRequests) {
        throw new Error(`Greedy task ${task.id} exceeded maxRequests=${maxRequests}`);
      }
    }
  }

  return {
    tasks,
    results,
    skipped,
    totalDocuments: results.reduce((sum, result) => sum + result.documentCount, 0),
    totalRequests: results.reduce((sum, result) => sum + result.requestCount, 0),
  };
}
