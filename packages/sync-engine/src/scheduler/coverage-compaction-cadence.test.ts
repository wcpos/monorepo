// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { planCoverageCompactionCadence } from './coverage-compaction-cadence';

const expiredRecord = { collection: 'orders', id: 'order-expired', coveredQueryKeys: ['orders:open'], freshUntilMs: 700, updatedAtMs: 600 };
const refreshRecord = { collection: 'orders', id: 'order-refresh', coveredQueryKeys: ['orders:open'], freshUntilMs: 950, updatedAtMs: 900 };
const freshLane = { collection: 'orders', queryKey: 'orders:open', complete: true, expectedRecordIds: ['order-expired'], freshUntilMs: 2_000, updatedAtMs: 1_000 };

const baseInput = {
  tabId: 'tab-a',
  nowMs: 1_000,
  intervalMs: 300,
  retainStaleForMs: 100,
  minExpiredDocuments: 1,
  lastCompactedAtMs: 500,
};

describe('planCoverageCompactionCadence', () => {
  it('runs compaction when expired coverage is due and no active lease exists', () => {
    const result = planCoverageCompactionCadence({
      ...baseInput,
      documents: { records: [expiredRecord], lanes: [freshLane] },
    });

    expect(result.action).toBe('run');
    expect(result.expiredDocuments).toBe(1);
    expect(result.ownerId).toBe('tab-a');
    expect(result.reason).toBe('expired persisted coverage is due for compaction');
  });

  it('skips when stale coverage is still inside the refresh retention window', () => {
    const result = planCoverageCompactionCadence({
      ...baseInput,
      documents: { records: [refreshRecord], lanes: [freshLane] },
    });

    expect(result.action).toBe('skip');
    expect(result.expiredDocuments).toBe(0);
    expect(result.reason).toBe('no expired persisted coverage documents meet the compaction threshold');
  });

  it('waits when another tab owns an active compaction lease', () => {
    const result = planCoverageCompactionCadence({
      ...baseInput,
      documents: { records: [expiredRecord], lanes: [freshLane] },
      lease: { ownerId: 'tab-b', acquiredAtMs: 900, expiresAtMs: 1_200 },
    });

    expect(result.action).toBe('wait-for-owner');
    expect(result.ownerId).toBe('tab-b');
    expect(result.reason).toBe('another tab owns the active compaction lease');
  });

  it('takes over when another tab owns an expired compaction lease', () => {
    const result = planCoverageCompactionCadence({
      ...baseInput,
      documents: { records: [expiredRecord], lanes: [freshLane] },
      lease: { ownerId: 'tab-b', acquiredAtMs: 400, expiresAtMs: 900 },
    });

    expect(result.action).toBe('take-over');
    expect(result.ownerId).toBe('tab-a');
    expect(result.previousOwnerId).toBe('tab-b');
    expect(result.reason).toBe('previous compaction lease expired');
  });

  it('waits through failed compaction backoff before claiming a lease', () => {
    const result = planCoverageCompactionCadence({
      ...baseInput,
      nowMs: 1_000,
      failedCompaction: { failedAtMs: 900, retryAfterMs: 1_200 },
      documents: { records: [expiredRecord], lanes: [freshLane] },
    });

    expect(result.action).toBe('wait-for-failure-backoff');
    expect(result.reason).toBe('previous compaction failure is still inside retry backoff');
    expect(result.nextDueAtMs).toBe(1_200);
  });

  it('runs after failed compaction backoff has elapsed', () => {
    const result = planCoverageCompactionCadence({
      ...baseInput,
      nowMs: 1_250,
      failedCompaction: { failedAtMs: 900, retryAfterMs: 1_200 },
      documents: { records: [expiredRecord], lanes: [freshLane] },
    });

    expect(result.action).toBe('run');
    expect(result.ownerId).toBe('tab-a');
  });
});
