// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  compactPersistedCoverageDocuments,
  coverageSchemaIndexes,
  expectedRecordIdsForLane,
  planPersistedCoverageRetention,
  toLocalCoverageState,
  type PersistedCoverageDocumentSet,
} from './persisted-coverage-schema';

const nowMs = 1_000;

const documents: PersistedCoverageDocumentSet = {
  records: [
    {
      collection: 'orders',
      id: 'order-1',
      coveredQueryKeys: ['orders:open'],
      freshUntilMs: 1_500,
      updatedAtMs: 900,
    },
    {
      collection: 'orders',
      id: 'order-2',
      coveredQueryKeys: ['orders:open'],
      freshUntilMs: 800,
      updatedAtMs: 700,
    },
  ],
  lanes: [
    {
      collection: 'orders',
      queryKey: 'orders:open',
      complete: true,
      expectedRecordIds: ['order-1', 'order-2'],
      freshUntilMs: 1_500,
      updatedAtMs: 900,
    },
    {
      collection: 'orders',
      queryKey: 'orders:recent',
      complete: true,
      expectedRecordIds: ['order-3'],
      freshUntilMs: 800,
      updatedAtMs: 700,
    },
  ],
};

describe('persisted coverage schema', () => {
  it('converts persisted records and lanes to local coverage freshness at the current clock', () => {
    expect(toLocalCoverageState({ documents, nowMs })).toEqual({
      records: [
        { collection: 'orders', id: 'order-1', fresh: true },
        { collection: 'orders', id: 'order-2', fresh: false },
      ],
      lanes: [
        { collection: 'orders', queryKey: 'orders:open', complete: true, fresh: true },
        { collection: 'orders', queryKey: 'orders:recent', complete: true, fresh: false },
      ],
    });
  });

  it('returns expected record ids only for a matching fresh complete lane', () => {
    expect(expectedRecordIdsForLane({ documents, collection: 'orders', queryKey: 'orders:open', nowMs })).toEqual(['order-1', 'order-2']);
    expect(expectedRecordIdsForLane({ documents, collection: 'orders', queryKey: 'orders:recent', nowMs })).toEqual([]);
    expect(expectedRecordIdsForLane({ documents, collection: 'orders', queryKey: 'orders:missing', nowMs })).toEqual([]);
  });

  it('returns a defensive copy of expected record ids', () => {
    const expectedIds = expectedRecordIdsForLane({ documents, collection: 'orders', queryKey: 'orders:open', nowMs });

    expectedIds.push('mutated-by-caller');

    expect(documents.lanes[0].expectedRecordIds).toEqual(['order-1', 'order-2']);
  });

  it('plans retention actions for fresh, stale-retained, and expired coverage documents', () => {
    expect(planPersistedCoverageRetention({ documents, nowMs, retainStaleForMs: 250 })).toEqual([
      {
        documentType: 'record',
        collection: 'orders',
        key: 'order-1',
        action: 'keep',
        reason: 'coverage is still fresh',
      },
      {
        documentType: 'record',
        collection: 'orders',
        key: 'order-2',
        action: 'refresh',
        reason: 'coverage is stale but still inside retention window',
      },
      {
        documentType: 'lane',
        collection: 'orders',
        key: 'orders:open',
        action: 'keep',
        reason: 'coverage is still fresh',
      },
      {
        documentType: 'lane',
        collection: 'orders',
        key: 'orders:recent',
        action: 'refresh',
        reason: 'coverage is stale but still inside retention window',
      },
    ]);

    expect(planPersistedCoverageRetention({ documents, nowMs, retainStaleForMs: 100 }).filter((decision) => decision.action === 'remove')).toEqual([
      {
        documentType: 'record',
        collection: 'orders',
        key: 'order-2',
        action: 'remove',
        reason: 'coverage is stale beyond retention window',
      },
      {
        documentType: 'lane',
        collection: 'orders',
        key: 'orders:recent',
        action: 'remove',
        reason: 'coverage is stale beyond retention window',
      },
    ]);
  });

  it('compacts expired persisted coverage while retaining fresh and refresh-eligible stale documents', () => {
    const result = compactPersistedCoverageDocuments({ documents, nowMs, retainStaleForMs: 100 });

    expect(result.documents).toEqual({
      records: [
        {
          collection: 'orders',
          id: 'order-1',
          coveredQueryKeys: ['orders:open'],
          freshUntilMs: 1_500,
          updatedAtMs: 900,
        },
      ],
      lanes: [
        {
          collection: 'orders',
          queryKey: 'orders:open',
          complete: true,
          expectedRecordIds: ['order-1', 'order-2'],
          freshUntilMs: 1_500,
          updatedAtMs: 900,
        },
      ],
    });
    expect(result.removed).toEqual([
      {
        documentType: 'record',
        collection: 'orders',
        key: 'order-2',
        action: 'remove',
        reason: 'coverage is stale beyond retention window',
      },
      {
        documentType: 'lane',
        collection: 'orders',
        key: 'orders:recent',
        action: 'remove',
        reason: 'coverage is stale beyond retention window',
      },
    ]);

    const staleRetained = compactPersistedCoverageDocuments({ documents, nowMs, retainStaleForMs: 250 });
    expect(staleRetained.documents).toEqual(documents);
    expect(staleRetained.removed).toEqual([]);
  });

  it('declares compound indexes needed for RxDB lookup and cleanup paths', () => {
    expect(coverageSchemaIndexes).toEqual({
      records: [
        ['collection', 'id'],
        ['collection', 'freshUntilMs'],
      ],
      lanes: [
        ['collection', 'queryKey'],
        ['collection', 'freshUntilMs'],
      ],
    });
  });
});
