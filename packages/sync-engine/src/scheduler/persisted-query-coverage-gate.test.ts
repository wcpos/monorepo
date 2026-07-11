// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { evaluatePersistedQueryCoverageGate } from './persisted-query-coverage-gate';

describe('evaluatePersistedQueryCoverageGate', () => {
  it('serves local when a complete fresh persisted lane covers current records and expected records are fresh', () => {
    const decision = evaluatePersistedQueryCoverageGate({
      collection: 'orders',
      queryKey: 'orders:browser:status=processing:search=:limit=50',
      currentRecordIds: ['woo-order:1', 'woo-order:2'],
      totalMatchingRecords: 2,
      laneCoverage: {
        collection: 'orders',
        queryKey: 'orders:browser:status=processing:search=:limit=50',
        complete: true,
        fresh: true,
        expectedRecordIds: ['woo-order:1', 'woo-order:2'],
      },
      recordCoverages: [
        { collection: 'orders', id: 'woo-order:1', fresh: true },
        { collection: 'orders', id: 'woo-order:2', fresh: true },
      ],
    });

    expect(decision.action).toBe('serve-local');
    expect(decision.reason).toBe('matching lane is complete and all expected records are fresh locally');
  });

  it('fetches remotely when current query totals exceed the complete persisted lane expected ids', () => {
    const decision = evaluatePersistedQueryCoverageGate({
      collection: 'orders',
      queryKey: 'orders:browser:status=processing:search=:limit=50',
      currentRecordIds: ['woo-order:1', 'woo-order:2'],
      totalMatchingRecords: 3,
      laneCoverage: {
        collection: 'orders',
        queryKey: 'orders:browser:status=processing:search=:limit=50',
        complete: true,
        fresh: true,
        expectedRecordIds: ['woo-order:1', 'woo-order:2'],
      },
      recordCoverages: [
        { collection: 'orders', id: 'woo-order:1', fresh: true },
        { collection: 'orders', id: 'woo-order:2', fresh: true },
      ],
    });

    expect(decision.action).toBe('fetch-remote');
    expect(decision.reason).toBe('current query evidence proves more matching records than the complete lane expected');
  });
});
