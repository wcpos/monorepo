// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { planCoverageCleanup, type CoverageCleanupInput } from './coverage-cleanup';

const input: CoverageCleanupInput = {
  collection: 'orders',
  queryKey: 'orders:status:open-recent',
  expectedRecordIds: ['woo-order:open-1', 'woo-order:open-2'],
  records: [
    { collection: 'orders', id: 'woo-order:open-1', fresh: true, coveredQueryKeys: ['orders:status:open-recent'] },
    { collection: 'orders', id: 'woo-order:open-2', fresh: false, coveredQueryKeys: ['orders:status:open-recent'] },
    { collection: 'orders', id: 'woo-order:closed-9', fresh: true, coveredQueryKeys: ['orders:status:open-recent'] },
    { collection: 'products', id: 'product:unrelated', fresh: true, coveredQueryKeys: ['products:initial:alphabetical'] },
  ],
};

describe('planCoverageCleanup', () => {
  it('keeps fresh records still expected by the lane', () => {
    const decisions = planCoverageCleanup(input);
    expect(decisions.find((decision) => decision.recordId === 'woo-order:open-1')).toEqual({
      recordId: 'woo-order:open-1',
      action: 'keep',
      reason: 'record is expected by lane and fresh',
    });
  });

  it('refreshes stale records still expected by the lane', () => {
    const decisions = planCoverageCleanup(input);
    expect(decisions.find((decision) => decision.recordId === 'woo-order:open-2')).toEqual({
      recordId: 'woo-order:open-2',
      action: 'refresh',
      reason: 'record is expected by lane but stale',
    });
  });

  it('removes local records that are no longer expected by the lane', () => {
    const decisions = planCoverageCleanup(input);
    expect(decisions.find((decision) => decision.recordId === 'woo-order:closed-9')).toEqual({
      recordId: 'woo-order:closed-9',
      action: 'remove',
      reason: 'record is no longer covered by lane',
    });
    expect(decisions.some((decision) => decision.recordId === 'product:unrelated')).toBe(false);
  });

  it('ignores same-collection records that were never covered by the cleaned lane', () => {
    const decisions = planCoverageCleanup({
      collection: 'orders',
      queryKey: 'orders:status:open-recent',
      expectedRecordIds: ['woo-order:open-1'],
      records: [
        { collection: 'orders', id: 'woo-order:open-1', fresh: true, coveredQueryKeys: ['orders:status:open-recent'] },
        { collection: 'orders', id: 'woo-order:deep-link-8', fresh: true, coveredQueryKeys: ['orders:ids:deep-link'] },
      ],
    });

    expect(decisions).toEqual([
      { recordId: 'woo-order:open-1', action: 'keep', reason: 'record is expected by lane and fresh' },
    ]);
  });

});
