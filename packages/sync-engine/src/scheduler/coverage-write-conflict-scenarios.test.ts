// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mergePersistedCoverageWrites } from './coverage-write-conflicts';
import { coverageWriteConflictScenarios, summarizeCoverageWriteConflictScenarios } from './coverage-write-conflict-scenarios';

describe('coverageWriteConflictScenarios', () => {
  it('covers record union, freshness, and lane no-downgrade cases', () => {
    const summaries = summarizeCoverageWriteConflictScenarios();

    expect(summaries.map((summary) => summary.recordConflicts)).toEqual([1, 1, 0, 0, 0]);
    expect(summaries.map((summary) => summary.laneConflicts)).toEqual([0, 0, 1, 1, 1]);
    expect(summaries[1].preventedFreshnessDowngrades).toBe(1);
    expect(summaries[3].preventedLaneDowngrades).toBe(1);
    expect(summaries[4].preventedLaneDowngrades).toBe(1);
  });

  it('covers same-millisecond lane ties without synthesizing expected ids', () => {
    const scenario = coverageWriteConflictScenarios.find(({ id }) => id === 'same-millisecond-lane-tie');

    expect(scenario).toBeDefined();
    expect(scenario?.description).toBe('Equal timestamps keep a deterministic complete snapshot without synthesizing expected IDs.');
    expect(scenario?.writes.map((write) => write.lanes[0]?.updatedAtMs)).toEqual([1_200, 1_200]);

    const result = mergePersistedCoverageWrites(scenario?.writes ?? []);

    expect(result.documents.lanes[0]).toEqual({
      collection: 'orders',
      queryKey: 'orders:open',
      complete: true,
      expectedRecordIds: ['order-1', 'order-2'],
      freshUntilMs: 1_700,
      updatedAtMs: 1_200,
    });
  });
});
