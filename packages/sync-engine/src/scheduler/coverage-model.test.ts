// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { evaluateCoverageRequirement, runCoverageComparison, type LocalCoverageState } from './coverage-model';
import type { ReplicationRequirement } from './replication-policy';

function requirement(overrides: Partial<ReplicationRequirement> & Pick<ReplicationRequirement, 'id' | 'collection'>): ReplicationRequirement {
  return {
    id: overrides.id,
    collection: overrides.collection,
    kind: overrides.kind ?? 'query',
    queryKey: overrides.queryKey ?? overrides.id,
    ids: overrides.ids,
    policy: {
      mode: overrides.policy?.mode ?? 'on-demand',
      priority: overrides.policy?.priority ?? 100,
      batchSize: overrides.policy?.batchSize ?? 10,
      maxRequests: overrides.policy?.maxRequests,
      pollingIntervalMs: overrides.policy?.pollingIntervalMs,
      staleAfterMs: overrides.policy?.staleAfterMs,
      offline: overrides.policy?.offline ?? { read: 'serve-local', write: 'queue' },
    },
  };
}

const baseState: LocalCoverageState = {
  records: [
    { collection: 'orders', id: 'woo-order:114', fresh: true },
    { collection: 'products', id: 'product:alpha', fresh: true },
  ],
  lanes: [
    { collection: 'products', queryKey: 'products:initial:alphabetical', complete: true, fresh: true },
  ],
};

describe('evaluateCoverageRequirement', () => {
  it('serves a targeted historical order locally with record-only coverage when the record is fresh', () => {
    const decision = evaluateCoverageRequirement({
      strategy: 'record-only',
      state: baseState,
      requirement: requirement({ id: 'orders.deepLink', collection: 'orders', kind: 'targeted-records', queryKey: 'orders:ids:deep-link', ids: ['woo-order:114'] }),
    });

    expect(decision.action).toBe('serve-local');
    expect(decision.reason).toBe('all required records are fresh locally');
  });

  it('shows lane-only false confidence when a complete lane is missing an expected record', () => {
    const decision = evaluateCoverageRequirement({
      strategy: 'lane-only',
      state: baseState,
      requirement: requirement({ id: 'products.initialAlphabetical', collection: 'products', kind: 'query', queryKey: 'products:initial:alphabetical' }),
      expectedRecordIds: ['product:alpha', 'product:missing'],
    });

    expect(decision.action).toBe('serve-local');
    expect(decision.reason).toBe('matching lane is complete and fresh');
    expect(decision.risks).toContain('lane metadata does not prove every expected record exists locally');
  });

  it('fetches remotely with record-and-lane coverage when lane metadata is complete but an expected record is missing', () => {
    const decision = evaluateCoverageRequirement({
      strategy: 'record-and-lane',
      state: baseState,
      requirement: requirement({ id: 'products.initialAlphabetical', collection: 'products', kind: 'query', queryKey: 'products:initial:alphabetical' }),
      expectedRecordIds: ['product:alpha', 'product:missing'],
    });

    expect(decision.action).toBe('fetch-remote');
    expect(decision.missingRecordIds).toEqual(['product:missing']);
  });

  it('does not trust a complete lane when current total evidence exceeds expected records', () => {
    const decision = evaluateCoverageRequirement({
      strategy: 'record-and-lane',
      state: {
        records: [
          { collection: 'products', id: 'product:alpha', fresh: true },
          { collection: 'products', id: 'product:beta', fresh: true },
        ],
        lanes: [{ collection: 'products', queryKey: 'products:category:coffee', complete: true, fresh: true }],
      },
      requirement: requirement({ id: 'products.categoryCoffee', collection: 'products', kind: 'query', queryKey: 'products:category:coffee' }),
      expectedRecordIds: ['product:alpha', 'product:beta'],
      currentRecordIds: ['product:alpha', 'product:beta'],
      totalMatchingRecords: 3,
    });

    expect(decision.action).toBe('fetch-remote');
    expect(decision.reason).toBe('current query evidence proves more matching records than the complete lane expected');
    expect(decision.risks).toEqual([]);
  });

  it('does not trust a complete lane when current visible records are outside the lane expected ids', () => {
    const decision = evaluateCoverageRequirement({
      strategy: 'record-and-lane',
      state: {
        records: [
          { collection: 'orders', id: 'woo-order:1', fresh: true },
          { collection: 'orders', id: 'woo-order:2', fresh: true },
        ],
        lanes: [{ collection: 'orders', queryKey: 'orders:status:processing', complete: true, fresh: true }],
      },
      requirement: requirement({ id: 'orders.processing', collection: 'orders', kind: 'query', queryKey: 'orders:status:processing' }),
      expectedRecordIds: ['woo-order:1'],
      currentRecordIds: ['woo-order:1', 'woo-order:2'],
      totalMatchingRecords: 2,
    });

    expect(decision.action).toBe('fetch-remote');
    expect(decision.reason).toBe('current query records are not covered by the complete lane expected ids');
  });

  it('does not let record-and-lane collapse to lane-only when expected record ids are unknown', () => {
    const decision = evaluateCoverageRequirement({
      strategy: 'record-and-lane',
      state: baseState,
      requirement: requirement({ id: 'products.initialAlphabetical', collection: 'products', kind: 'query', queryKey: 'products:initial:alphabetical' }),
    });

    expect(decision.action).toBe('fetch-remote');
    expect(decision.reason).toBe('record-and-lane coverage needs expected record ids to verify local records');
  });
});

describe('runCoverageComparison', () => {
  it('compares all strategies for each coverage case', () => {
    const results = runCoverageComparison([
      {
        id: 'product-initial-lane-missing-record',
        label: 'Initial product lane missing one record',
        requirement: requirement({ id: 'products.initialAlphabetical', collection: 'products', kind: 'query', queryKey: 'products:initial:alphabetical' }),
        state: baseState,
        expectedRecordIds: ['product:alpha', 'product:missing'],
      },
    ]);

    expect(results.map((result) => result.strategy)).toEqual(['record-only', 'lane-only', 'record-and-lane']);
    expect(results.map((result) => result.action)).toEqual(['fetch-remote', 'serve-local', 'fetch-remote']);
  });
});
