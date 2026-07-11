// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mergePersistedCoverageWrites } from './coverage-write-conflicts';

describe('mergePersistedCoverageWrites', () => {
  it('unions covered query keys for concurrent record writes in first-seen order', () => {
    const result = mergePersistedCoverageWrites([
      { records: [{ collection: 'orders', id: 'order-1', coveredQueryKeys: ['orders:open'], freshUntilMs: 1_500, updatedAtMs: 1_000 }], lanes: [] },
      { records: [{ collection: 'orders', id: 'order-1', coveredQueryKeys: ['orders:recent', 'orders:open'], freshUntilMs: 1_400, updatedAtMs: 1_100 }], lanes: [] },
    ]);

    expect(result.documents.records).toEqual([
      { collection: 'orders', id: 'order-1', coveredQueryKeys: ['orders:open', 'orders:recent'], freshUntilMs: 1_500, updatedAtMs: 1_100 },
    ]);
    expect(result.summary.recordConflicts).toBe(1);
  });

  it('does not downgrade record freshness with an older stale write', () => {
    const result = mergePersistedCoverageWrites([
      { records: [{ collection: 'orders', id: 'order-1', coveredQueryKeys: ['orders:open'], freshUntilMs: 2_000, updatedAtMs: 1_200 }], lanes: [] },
      { records: [{ collection: 'orders', id: 'order-1', coveredQueryKeys: ['orders:cancelled'], freshUntilMs: 900, updatedAtMs: 900 }], lanes: [] },
    ]);

    expect(result.documents.records[0]).toEqual({ collection: 'orders', id: 'order-1', coveredQueryKeys: ['orders:open', 'orders:cancelled'], freshUntilMs: 2_000, updatedAtMs: 1_200 });
    expect(result.summary.preventedFreshnessDowngrades).toBe(1);
  });

  it('keeps newest record update timestamp while retaining maximum freshness', () => {
    const result = mergePersistedCoverageWrites([
      { records: [{ collection: 'orders', id: 'order-1', coveredQueryKeys: ['orders:open'], freshUntilMs: 2_000, updatedAtMs: 1_000 }], lanes: [] },
      { records: [{ collection: 'orders', id: 'order-1', coveredQueryKeys: ['orders:recent'], freshUntilMs: 1_800, updatedAtMs: 1_300 }], lanes: [] },
    ]);

    expect(result.documents.records[0]).toEqual({ collection: 'orders', id: 'order-1', coveredQueryKeys: ['orders:open', 'orders:recent'], freshUntilMs: 2_000, updatedAtMs: 1_300 });
  });

  it('uses the newest lane metadata for duplicate query lanes', () => {
    const result = mergePersistedCoverageWrites([
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: false, expectedRecordIds: ['order-1'], freshUntilMs: 1_500, updatedAtMs: 1_000 }] },
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-1', 'order-2'], freshUntilMs: 1_700, updatedAtMs: 1_200 }] },
    ]);

    expect(result.documents.lanes).toEqual([
      { collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-1', 'order-2'], freshUntilMs: 1_700, updatedAtMs: 1_200 },
    ]);
    expect(result.summary.laneConflicts).toBe(1);
  });

  it('does not count a newer lane improvement as a prevented downgrade', () => {
    const result = mergePersistedCoverageWrites([
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: false, expectedRecordIds: ['order-1'], freshUntilMs: 1_500, updatedAtMs: 1_000 }] },
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-1', 'order-2'], freshUntilMs: 1_700, updatedAtMs: 1_200 }] },
    ]);

    expect(result.summary.preventedLaneDowngrades).toBe(0);
  });

  it('prevents stale lane writes from overwriting newer complete lane expected ids', () => {
    const result = mergePersistedCoverageWrites([
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-1', 'order-2'], freshUntilMs: 1_700, updatedAtMs: 1_200 }] },
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: false, expectedRecordIds: ['order-1'], freshUntilMs: 1_300, updatedAtMs: 1_000 }] },
    ]);

    expect(result.documents.lanes[0]).toEqual({ collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-1', 'order-2'], freshUntilMs: 1_700, updatedAtMs: 1_200 });
    expect(result.summary.preventedLaneDowngrades).toBe(1);
  });

  it('preserves newer incomplete lane evidence when known totals invalidate older complete lanes', () => {
    const result = mergePersistedCoverageWrites([
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-1', 'order-2'], freshUntilMs: 1_700, updatedAtMs: 1_200 }] },
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: false, expectedRecordIds: ['order-1', 'order-2'], freshUntilMs: 1_900, updatedAtMs: 1_300 }] },
    ]);

    expect(result.documents.lanes[0]).toEqual({ collection: 'orders', queryKey: 'orders:open', complete: false, expectedRecordIds: ['order-1', 'order-2'], freshUntilMs: 1_900, updatedAtMs: 1_300 });
    expect(result.summary.preventedLaneDowngrades).toBe(0);
  });

  it('lets newer incomplete lane probes with new expected ids invalidate older complete lanes', () => {
    const result = mergePersistedCoverageWrites([
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-1', 'order-2'], freshUntilMs: 1_700, updatedAtMs: 1_200 }] },
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: false, expectedRecordIds: ['order-1', 'order-2', 'order-3'], freshUntilMs: 1_900, updatedAtMs: 1_300 }] },
    ]);

    expect(result.documents.lanes[0]).toEqual({ collection: 'orders', queryKey: 'orders:open', complete: false, expectedRecordIds: ['order-1', 'order-2', 'order-3'], freshUntilMs: 1_900, updatedAtMs: 1_300 });
    expect(result.summary.preventedLaneDowngrades).toBe(0);
  });

  it('preserves complete lane metadata on equal timestamp ties', () => {
    const result = mergePersistedCoverageWrites([
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-1', 'order-2'], freshUntilMs: 1_700, updatedAtMs: 1_200 }] },
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: false, expectedRecordIds: ['order-1', 'order-3'], freshUntilMs: 1_300, updatedAtMs: 1_200 }] },
    ]);

    expect(result.documents.lanes[0]).toEqual({ collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-1', 'order-2'], freshUntilMs: 1_700, updatedAtMs: 1_200 });
    expect(result.summary.preventedLaneDowngrades).toBe(1);
  });

  it('does not synthesize complete lane expected ids from equal timestamp complete snapshots', () => {
    const result = mergePersistedCoverageWrites([
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-1', 'order-2'], freshUntilMs: 1_600, updatedAtMs: 1_200 }] },
      { records: [], lanes: [{ collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-3'], freshUntilMs: 1_700, updatedAtMs: 1_200 }] },
    ]);

    expect(result.documents.lanes[0]).toEqual({ collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-3'], freshUntilMs: 1_700, updatedAtMs: 1_200 });
  });
});
