// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { planQueryTotalDiscovery } from './query-total-discovery';

const baseInput = {
  queryKey: 'orders:browser:status=all:search=:limit=50',
  returnedRecordCount: 50,
  limit: 50,
  querySettled: true,
  localCatalogComplete: true,
  catalogTotal: 100,
  queryHasFilters: false,
  querySpecificTotal: null,
};

describe('planQueryTotalDiscovery', () => {
  it('waits for unsettled rendered queries without requesting totals', () => {
    expect(planQueryTotalDiscovery({ ...baseInput, querySettled: false })).toEqual(expect.objectContaining({
      action: 'wait-for-settled-query',
      complete: false,
      shouldRequestQueryTotal: false,
      totalMatchingRecords: null,
    }));
  });

  it('waits for complete local catalog evidence before trusting rendered query totals', () => {
    expect(planQueryTotalDiscovery({ ...baseInput, localCatalogComplete: false })).toEqual(expect.objectContaining({
      action: 'wait-for-catalog-complete',
      complete: false,
      shouldRequestQueryTotal: false,
      totalMatchingRecords: null,
    }));
  });

  it('marks below-limit settled results complete using returned count as total evidence', () => {
    expect(planQueryTotalDiscovery({ ...baseInput, returnedRecordCount: 12, limit: 50, catalogTotal: 100 })).toEqual(expect.objectContaining({
      action: 'record-complete-lane',
      complete: true,
      shouldRequestQueryTotal: false,
      totalMatchingRecords: 12,
    }));
  });

  it('marks exact-limit unfiltered results complete when the catalog total matches returned count', () => {
    expect(planQueryTotalDiscovery({ ...baseInput, returnedRecordCount: 50, limit: 50, catalogTotal: 50, queryHasFilters: false })).toEqual(expect.objectContaining({
      action: 'record-complete-lane',
      complete: true,
      shouldRequestQueryTotal: false,
      totalMatchingRecords: 50,
    }));
  });

  it('prefers catalog totals over query-specific totals for exact-limit unfiltered results', () => {
    expect(planQueryTotalDiscovery({
      ...baseInput,
      returnedRecordCount: 50,
      limit: 50,
      catalogTotal: 50,
      queryHasFilters: false,
      querySpecificTotal: 75,
    })).toEqual(expect.objectContaining({
      action: 'record-complete-lane',
      complete: true,
      shouldRequestQueryTotal: false,
      totalMatchingRecords: 50,
    }));
  });

  it('requests a query-specific total for exact-limit filtered results without known query total', () => {
    expect(planQueryTotalDiscovery({ ...baseInput, queryKey: 'orders:browser:status=processing:search=:limit=50', queryHasFilters: true, querySpecificTotal: null })).toEqual(expect.objectContaining({
      action: 'request-query-total',
      complete: false,
      shouldRequestQueryTotal: true,
      totalMatchingRecords: null,
    }));
  });

  it('marks exact-limit filtered results complete when query-specific total equals returned count', () => {
    expect(planQueryTotalDiscovery({ ...baseInput, queryHasFilters: true, querySpecificTotal: 50 })).toEqual(expect.objectContaining({
      action: 'record-complete-lane',
      complete: true,
      shouldRequestQueryTotal: false,
      totalMatchingRecords: 50,
    }));
  });

  it('records an incomplete lane when query-specific total proves more matches exist', () => {
    expect(planQueryTotalDiscovery({ ...baseInput, queryHasFilters: true, querySpecificTotal: 75 })).toEqual(expect.objectContaining({
      action: 'record-incomplete-lane',
      complete: false,
      shouldRequestQueryTotal: false,
      totalMatchingRecords: 75,
    }));
  });
});
