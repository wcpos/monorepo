// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  persistedCoverageSchemaScenarios,
  summarizePersistedCoverageSchemaScenario,
  summarizePersistedCoverageSchemaScenarios,
} from './persisted-coverage-schema-scenarios';

describe('persisted coverage schema scenarios', () => {
  it('declares a non-empty catalog of unique scenario ids', () => {
    const ids = persistedCoverageSchemaScenarios.map((scenario) => scenario.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('summarizes local freshness, expected ids, and retention decisions for each scenario', () => {
    expect(summarizePersistedCoverageSchemaScenarios()).toEqual([
      {
        scenarioId: 'persisted-open-orders-fresh',
        freshRecords: 2,
        freshLanes: 1,
        expectedRecordIds: ['order-1', 'order-2'],
        keep: 3,
        refresh: 0,
        remove: 0,
      },
      {
        scenarioId: 'persisted-products-stale-retained',
        freshRecords: 0,
        freshLanes: 0,
        expectedRecordIds: [],
        keep: 0,
        refresh: 3,
        remove: 0,
      },
      {
        scenarioId: 'persisted-orders-expired-removal',
        freshRecords: 0,
        freshLanes: 0,
        expectedRecordIds: [],
        keep: 0,
        refresh: 0,
        remove: 2,
      },
    ]);
  });

  it('formats a reviewer-facing scenario summary', () => {
    expect(summarizePersistedCoverageSchemaScenario(persistedCoverageSchemaScenarios[0])).toBe('2 fresh records, 1 fresh lane, 2 expected ids, retention keep 3 / refresh 0 / remove 0');
  });
});
