import { planQueryTotalDiscovery, type QueryTotalDiscoveryDecision, type QueryTotalDiscoveryInput } from './query-total-discovery';

export type QueryTotalDiscoveryScenario = {
  id: string;
  label: string;
  description: string;
  input: QueryTotalDiscoveryInput;
};

export type QueryTotalDiscoveryScenarioSummary = Pick<QueryTotalDiscoveryDecision,
  'action' | 'reason' | 'complete' | 'shouldRequestQueryTotal' | 'totalMatchingRecords'
> & {
  scenarioId: string;
  label: string;
  returnedRecordCount: number;
  limit: number;
};

const baseInput = {
  querySettled: true,
  localCatalogComplete: true,
  catalogTotal: 100,
  limit: 50,
};

export const queryTotalDiscoveryScenarios: QueryTotalDiscoveryScenario[] = [
  {
    id: 'below-limit-filtered-query',
    label: 'Below-limit filtered · bounded locally',
    description: 'A settled filtered result below the active limit proves all matching local records are visible.',
    input: { ...baseInput, queryKey: 'orders:browser:status=processing:search=:limit=50', returnedRecordCount: 12, queryHasFilters: true, querySpecificTotal: null },
  },
  {
    id: 'exact-limit-unfiltered-catalog-total',
    label: 'Exact-limit unfiltered · catalog total',
    description: 'An unfiltered exact-limit result can use the trusted Woo catalog total when it matches the visible count.',
    input: { ...baseInput, queryKey: 'orders:browser:status=all:search=:limit=50', returnedRecordCount: 50, catalogTotal: 50, queryHasFilters: false, querySpecificTotal: null },
  },
  {
    id: 'exact-limit-filtered-needs-total',
    label: 'Exact-limit filtered · needs total',
    description: 'A filtered exact-limit result needs a query-specific Woo total before expected ids are trusted.',
    input: { ...baseInput, queryKey: 'orders:browser:status=processing:search=:limit=50', returnedRecordCount: 50, queryHasFilters: true, querySpecificTotal: null },
  },
  {
    id: 'exact-limit-filtered-total-complete',
    label: 'Filtered total · complete',
    description: 'A query-specific total equal to the visible count proves the filtered lane is complete.',
    input: { ...baseInput, queryKey: 'orders:browser:status=processing:search=:limit=50', returnedRecordCount: 50, queryHasFilters: true, querySpecificTotal: 50 },
  },
  {
    id: 'exact-limit-filtered-total-truncated',
    label: 'Filtered total · truncated',
    description: 'A query-specific total larger than the visible count proves more matches exist and the lane stays incomplete.',
    input: { ...baseInput, queryKey: 'orders:browser:status=processing:search=:limit=50', returnedRecordCount: 50, queryHasFilters: true, querySpecificTotal: 75 },
  },
];

export function summarizeQueryTotalDiscoveryScenarios(): QueryTotalDiscoveryScenarioSummary[] {
  return queryTotalDiscoveryScenarios.map((scenario) => {
    const decision = planQueryTotalDiscovery(scenario.input);
    return {
      scenarioId: scenario.id,
      label: scenario.label,
      action: decision.action,
      reason: decision.reason,
      complete: decision.complete,
      shouldRequestQueryTotal: decision.shouldRequestQueryTotal,
      totalMatchingRecords: decision.totalMatchingRecords,
      returnedRecordCount: scenario.input.returnedRecordCount,
      limit: scenario.input.limit,
    };
  });
}
