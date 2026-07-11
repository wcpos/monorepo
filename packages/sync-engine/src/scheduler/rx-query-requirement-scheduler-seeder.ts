import { evaluateCoverageRequirement, type CoverageDecision } from './coverage-model';
import { toLocalCoverageState, type PersistedCoverageDocumentSet } from './persisted-coverage-schema';
import { buildDeclarationsFromPersistedCoverage } from './persisted-coverage-query-flow';
import { buildSchedulerCoverageRequirementsFromDeclarations, type QueryRequirementDeclaration } from './query-requirement-library';
import { planSchedulerTasks } from './replication-scheduler';
import type { ConnectivityMode, FetchTask } from './replication-policy';
import { seedPersistedSchedulerTasks, type SchedulerTaskSeederRepository, type SeedPersistedSchedulerTasksResult } from './rx-scheduler-task-seeder';
import { schedulerTaskStateSchema } from './scheduler-task-state-schema';

export type QueryRequirementCoverageRepository = {
  readSnapshot: () => Promise<PersistedCoverageDocumentSet>;
};

export type SeedSchedulerTasksFromQueryDeclarationsInput = {
  coverageRepository: QueryRequirementCoverageRepository;
  schedulerRepository: SchedulerTaskSeederRepository;
  connectivity: ConnectivityMode;
  declarations: QueryRequirementDeclaration[];
  nowMs: number;
  completedDedupeForMs: number;
};

export type InvalidQueryDeclarationTask = {
  taskId: string;
  requirementId: string;
  reason: string;
};

export type SeedSchedulerTasksFromQueryDeclarationsResult = {
  coverageDecisions: CoverageDecision[];
  plannedTasks: FetchTask[];
  skipped: Array<{ requirementId: string; reason: string }>;
  invalidTasks: InvalidQueryDeclarationTask[];
  seedResult: SeedPersistedSchedulerTasksResult;
};

const SCHEDULER_REQUIREMENT_ID_MAX_LENGTH = schedulerTaskStateSchema.properties.requirementId.maxLength;
const SCHEDULER_QUERY_KEY_MAX_LENGTH = schedulerTaskStateSchema.properties.queryKey.maxLength;

function invalidTaskReason(task: FetchTask): string | null {
  if (task.requirementId.length > SCHEDULER_REQUIREMENT_ID_MAX_LENGTH) {
    return `requirementId exceeds persisted scheduler limit: ${task.requirementId.length} > ${SCHEDULER_REQUIREMENT_ID_MAX_LENGTH}`;
  }
  if (task.queryKey.length > SCHEDULER_QUERY_KEY_MAX_LENGTH) {
    return `queryKey exceeds persisted scheduler limit: ${task.queryKey.length} > ${SCHEDULER_QUERY_KEY_MAX_LENGTH}`;
  }
  return null;
}

function validSchedulerTasks(tasks: FetchTask[]): { validTasks: FetchTask[]; invalidTasks: InvalidQueryDeclarationTask[] } {
  const validTasks: FetchTask[] = [];
  const invalidTasks: InvalidQueryDeclarationTask[] = [];

  for (const task of tasks) {
    const reason = invalidTaskReason(task);
    if (reason) {
      invalidTasks.push({ taskId: task.id, requirementId: task.requirementId, reason });
      continue;
    }
    validTasks.push(task);
  }

  return { validTasks, invalidTasks };
}

export async function seedSchedulerTasksFromQueryDeclarations(input: SeedSchedulerTasksFromQueryDeclarationsInput): Promise<SeedSchedulerTasksFromQueryDeclarationsResult> {
  const documents = await input.coverageRepository.readSnapshot();
  const declarations = buildDeclarationsFromPersistedCoverage({ documents, nowMs: input.nowMs, declarations: input.declarations });
  const coverageState = toLocalCoverageState({ documents, nowMs: input.nowMs });
  const requirements = buildSchedulerCoverageRequirementsFromDeclarations({
    coverageState,
    declarations,
  });
  const coverageDecisions = requirements.map((item) => evaluateCoverageRequirement({
    strategy: item.coverageStrategy,
    state: item.coverageState,
    requirement: item.requirement,
    expectedRecordIds: item.expectedRecordIds,
    currentRecordIds: item.currentRecordIds,
    totalMatchingRecords: item.totalMatchingRecords,
  }));
  const requirementById = new Map(requirements.map((item) => [item.requirement.id, item.requirement] as const));
  const remoteRequirements = coverageDecisions
    .filter((decision) => decision.action === 'fetch-remote')
    .map((decision) => requirementById.get(decision.requirementId))
    .filter((requirement): requirement is NonNullable<typeof requirement> => Boolean(requirement));
  const taskPlan = planSchedulerTasks({
    connectivity: input.connectivity,
    requirements: remoteRequirements,
  });
  const { validTasks, invalidTasks } = validSchedulerTasks(taskPlan.tasks);
  const seedResult = await seedPersistedSchedulerTasks({
    repository: input.schedulerRepository,
    tasks: validTasks,
    nowMs: input.nowMs,
    completedDedupeForMs: input.completedDedupeForMs,
  });

  return {
    coverageDecisions,
    plannedTasks: validTasks,
    skipped: taskPlan.skipped,
    invalidTasks,
    seedResult,
  };
}
