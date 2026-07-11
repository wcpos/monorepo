import { planPersistedSchedulerTaskStates, type PersistedSchedulerTaskState, type PersistedSchedulerTaskStatePlan } from './persisted-scheduler-state';
import type { FetchTask } from './replication-policy';

export type SchedulerTaskPlannerRepository = {
  readForTaskIds(taskIds: string[]): Promise<PersistedSchedulerTaskState[]>;
  claimNew(state: PersistedSchedulerTaskState): Promise<boolean>;
  claim(expectedState: PersistedSchedulerTaskState, claimedState: PersistedSchedulerTaskState): Promise<boolean>;
};

export type PlanAndPersistSchedulerTasksInput = {
  repository: SchedulerTaskPlannerRepository;
  tasks: FetchTask[];
  ownerId: string;
  nowMs: number;
  claimForMs: number;
  completedDedupeForMs?: number;
  ignoreRetryBackoff?: boolean;
};

export type PlanAndPersistSchedulerTasksResult = {
  plan: PersistedSchedulerTaskStatePlan;
  claimedStates: PersistedSchedulerTaskState[];
};

export async function planAndPersistSchedulerTasks(input: PlanAndPersistSchedulerTasksInput): Promise<PlanAndPersistSchedulerTasksResult> {
  const taskIds = [...new Set(input.tasks.map((task) => task.id))];
  const existingStates = await input.repository.readForTaskIds(taskIds);
  const existingByTaskId = new Map(existingStates.map((state) => [state.taskId, state] as const));
  const plan = planPersistedSchedulerTaskStates({
    nowMs: input.nowMs,
    ownerId: input.ownerId,
    claimForMs: input.claimForMs,
    completedDedupeForMs: input.completedDedupeForMs,
    ignoreRetryBackoff: input.ignoreRetryBackoff,
    tasks: input.tasks,
    existingStates,
  });
  const claimedStates: PersistedSchedulerTaskState[] = [];

  for (const claim of plan.claimed) {
    const claimedState = plan.states.find((state) => state.taskId === claim.taskId);
    if (!claimedState) continue;

    const existingState = existingByTaskId.get(claim.taskId);
    const acquired = existingState
      ? await input.repository.claim(existingState, claimedState)
      : await input.repository.claimNew(claimedState);

    if (acquired) claimedStates.push(claimedState);
  }

  return { plan, claimedStates };
}
