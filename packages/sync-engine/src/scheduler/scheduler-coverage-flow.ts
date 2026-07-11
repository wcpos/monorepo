import { evaluateCoverageRequirement, type CoverageDecision, type CoverageStrategy, type LocalCoverageState } from './coverage-model';
import { runSchedulerScenario, type SchedulerFetcher } from './replication-scheduler';
import type { ConnectivityMode, ReplicationRequirement, SchedulerRunResult } from './replication-policy';

export type SchedulerCoverageFlowRequirement = {
  requirement: ReplicationRequirement;
  coverageStrategy: CoverageStrategy;
  coverageState: LocalCoverageState;
  expectedRecordIds?: string[];
  currentRecordIds?: string[];
  totalMatchingRecords?: number | null;
};

export type SchedulerCoverageFlowInput = {
  connectivity: ConnectivityMode;
  requirements: SchedulerCoverageFlowRequirement[];
  fetcher: SchedulerFetcher;
};

export type SchedulerCoverageFlowSummary = {
  servedLocal: number;
  remoteTasks: number;
  skipped: number;
  totalRequests: number;
  totalDocuments: number;
};

export type SchedulerCoverageFlowResult = {
  coverageDecisions: CoverageDecision[];
  servedLocal: CoverageDecision[];
  scheduler: SchedulerRunResult;
  summary: SchedulerCoverageFlowSummary;
};

export async function runSchedulerCoverageFlow(input: SchedulerCoverageFlowInput): Promise<SchedulerCoverageFlowResult> {
  const coverageDecisions = input.requirements.map((item) => evaluateCoverageRequirement({
    strategy: item.coverageStrategy,
    state: item.coverageState,
    requirement: item.requirement,
    expectedRecordIds: item.expectedRecordIds,
    currentRecordIds: item.currentRecordIds,
    totalMatchingRecords: item.totalMatchingRecords,
  }));
  const requirementById = new Map(input.requirements.map((item) => [item.requirement.id, item.requirement]));
  const servedLocal = coverageDecisions.filter((decision) => decision.action === 'serve-local');
  const remoteRequirements = coverageDecisions
    .filter((decision) => decision.action === 'fetch-remote')
    .map((decision) => requirementById.get(decision.requirementId))
    .filter((requirement): requirement is ReplicationRequirement => Boolean(requirement));
  const scheduler = await runSchedulerScenario({
    connectivity: input.connectivity,
    requirements: remoteRequirements,
    fetcher: input.fetcher,
  });

  return {
    coverageDecisions,
    servedLocal,
    scheduler,
    summary: {
      servedLocal: servedLocal.length,
      remoteTasks: scheduler.tasks.length,
      skipped: scheduler.skipped.length,
      totalRequests: scheduler.totalRequests,
      totalDocuments: scheduler.totalDocuments,
    },
  };
}

export function summarizeSchedulerCoverageFlowResult(result: SchedulerCoverageFlowResult): string {
  return `served local ${result.summary.servedLocal} · remote tasks ${result.summary.remoteTasks} · skipped ${result.summary.skipped} · requests ${result.summary.totalRequests} · docs ${result.summary.totalDocuments}`;
}
