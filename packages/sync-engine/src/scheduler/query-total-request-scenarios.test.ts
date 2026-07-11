// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { queryTotalRequestScenarios, summarizeQueryTotalRequestScenarios } from './query-total-request-scenarios';

describe('queryTotalRequestScenarios', () => {
  it('covers cache, in-flight, offline, and enqueue request outcomes', () => {
    const summaries = summarizeQueryTotalRequestScenarios();

    expect(summaries.map((summary) => summary.action)).toEqual([
      'use-cached-total',
      'wait-for-in-flight',
      'skip-offline',
      'enqueue-total-request',
      'skip-not-needed',
    ]);
    expect(summaries[0].totalMatchingRecords).toBe(50);
    expect(summaries[3].requestParams).toEqual({ status: 'processing', search: 'hat', page: 1, per_page: 1 });
  });
});
