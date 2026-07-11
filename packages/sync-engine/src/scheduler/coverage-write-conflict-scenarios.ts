import { mergePersistedCoverageWrites, type CoverageWriteConflictSummary } from './coverage-write-conflicts';
import type { PersistedCoverageDocumentSet } from './persisted-coverage-schema';

export type CoverageWriteConflictScenario = {
  id: string;
  label: string;
  description: string;
  writes: PersistedCoverageDocumentSet[];
};

export type CoverageWriteConflictScenarioSummary = CoverageWriteConflictSummary & {
  scenarioId: string;
  label: string;
  mergedRecords: number;
  mergedLanes: number;
};

export const coverageWriteConflictScenarios: CoverageWriteConflictScenario[] = [
  {
    id: 'record-query-key-union',
    label: 'Record query-key union',
    description: 'Concurrent tabs covering the same record through different lanes must not lose either lane key.',
    writes: [
      { records: [{ collection: 'orders', id: 'order-1', coveredQueryKeys: ['orders:open'], freshUntilMs: 1_500, updatedAtMs: 1_000 }], lanes: [] },
      { records: [{ collection: 'orders', id: 'order-1', coveredQueryKeys: ['orders:recent'], freshUntilMs: 1_400, updatedAtMs: 1_100 }], lanes: [] },
    ],
  },
  {
    id: 'record-freshness-no-downgrade',
    label: 'Record freshness no downgrade',
    description: 'A stale record write can add coverage metadata without shortening a fresher record window.',
    writes: [
      { records: [{ collection: 'orders', id: 'order-1', coveredQueryKeys: ['orders:open'], freshUntilMs: 2_000, updatedAtMs: 1_200 }], lanes: [] },
      { records: [{ collection: 'orders', id: 'order-1', coveredQueryKeys: ['orders:cancelled'], freshUntilMs: 900, updatedAtMs: 900 }], lanes: [] },
    ],
  },
  {
    id: 'newest-lane-complete-wins',
    label: 'Newest lane complete wins',
    description: 'A newer complete lane write should replace older incomplete lane metadata for the same query.',
    writes: [
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: false, expectedRecordIds: ['order-1'], freshUntilMs: 1_500, updatedAtMs: 1_000 }] },
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-1', 'order-2'], freshUntilMs: 1_700, updatedAtMs: 1_200 }] },
    ],
  },
  {
    id: 'stale-lane-cannot-downgrade',
    label: 'Stale lane cannot downgrade',
    description: 'An older incomplete lane must not overwrite newer complete expected IDs.',
    writes: [
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-1', 'order-2'], freshUntilMs: 1_700, updatedAtMs: 1_200 }] },
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: false, expectedRecordIds: ['order-1'], freshUntilMs: 1_300, updatedAtMs: 1_000 }] },
    ],
  },
  {
    id: 'same-millisecond-lane-tie',
    label: 'Same-millisecond lane tie',
    description: 'Equal timestamps keep a deterministic complete snapshot without synthesizing expected IDs.',
    writes: [
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-1', 'order-2'], freshUntilMs: 1_700, updatedAtMs: 1_200 }] },
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: false, expectedRecordIds: ['order-1', 'order-3'], freshUntilMs: 1_300, updatedAtMs: 1_200 }] },
    ],
  },
];

export function summarizeCoverageWriteConflictScenarios(): CoverageWriteConflictScenarioSummary[] {
  return coverageWriteConflictScenarios.map((scenario) => {
    const result = mergePersistedCoverageWrites(scenario.writes);
    return {
      scenarioId: scenario.id,
      label: scenario.label,
      ...result.summary,
      mergedRecords: result.documents.records.length,
      mergedLanes: result.documents.lanes.length,
    };
  });
}
