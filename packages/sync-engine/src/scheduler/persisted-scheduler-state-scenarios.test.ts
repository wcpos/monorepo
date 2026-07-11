// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { persistedSchedulerStateScenarios, summarizePersistedSchedulerStateScenarios } from './persisted-scheduler-state-scenarios';

describe('persisted scheduler state scenarios', () => {
  it('declares a non-empty catalog of unique scenario ids', () => {
    const ids = persistedSchedulerStateScenarios.map((scenario) => scenario.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('summarizes durable scheduling decisions for the simulator table', () => {
    expect(summarizePersistedSchedulerStateScenarios()).toEqual([
      expect.objectContaining({ scenarioId: 'new-query-task-claim', claimed: ['orders.open'], waiting: [], completed: [], nextStatuses: ['orders.open:in-flight:tab-a'] }),
      expect.objectContaining({ scenarioId: 'active-owner-wait', claimed: [], waiting: ['orders.open:active-owner:tab-b'], completed: [], nextStatuses: ['orders.open:in-flight:tab-b'] }),
      expect.objectContaining({ scenarioId: 'expired-owner-takeover', claimed: ['orders.open'], waiting: [], completed: [], nextStatuses: ['orders.open:in-flight:tab-a'] }),
      expect.objectContaining({ scenarioId: 'failed-task-backoff', claimed: [], waiting: ['orders.open:retry-backoff:—'], completed: [], nextStatuses: ['orders.open:failed:—'] }),
      expect.objectContaining({ scenarioId: 'completed-task-dedupe', claimed: [], waiting: [], completed: ['orders.open'], nextStatuses: ['orders.open:completed:—'] }),
    ]);
  });
});
