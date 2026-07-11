import { planQueryTotalRequest, type QueryTotalRequestDecision, type QueryTotalRequestPlannerInput } from './query-total-requests';

export type QueryTotalRequestScenario = {
  id: string;
  label: string;
  description: string;
  input: QueryTotalRequestPlannerInput;
};

export type QueryTotalRequestScenarioSummary = Pick<QueryTotalRequestDecision,
  'action' | 'reason' | 'cacheStatus' | 'totalMatchingRecords'
> & {
  scenarioId: string;
  label: string;
  requestEndpoint: string | null;
  requestParams: Record<string, string | number | boolean> | null;
};

const needsTotal = {
  queryKey: 'orders:browser:status=processing:search=hat:limit=50',
  action: 'request-query-total' as const,
  reason: 'filtered exact-limit query needs a query-specific Woo total before expected ids are trusted',
  complete: false,
  shouldRequestQueryTotal: true,
  totalMatchingRecords: null,
};

const notNeeded = {
  queryKey: 'orders:browser:status=processing:search=hat:limit=50',
  action: 'record-complete-lane' as const,
  reason: 'returned records are below the page limit, so the rendered query is bounded locally',
  complete: true,
  shouldRequestQueryTotal: false,
  totalMatchingRecords: 12,
};

const baseInput = {
  endpoint: '/wp-json/wc/v3/orders',
  filters: { status: 'processing', search: 'hat' },
  nowMs: 1_500,
  connectivity: 'online' as const,
  inFlightQueryKeys: [],
};

export const queryTotalRequestScenarios: QueryTotalRequestScenario[] = [
  {
    id: 'fresh-cache-total',
    label: 'Fresh cache · use total',
    description: 'A fresh cached query-specific Woo total can complete discovery without another remote request.',
    input: { ...baseInput, discovery: needsTotal, cacheEntries: [{ queryKey: needsTotal.queryKey, totalMatchingRecords: 50, freshUntilMs: 2_000, updatedAtMs: 1_000 }] },
  },
  {
    id: 'in-flight-total-request',
    label: 'In-flight · wait',
    description: 'Duplicate exact-limit filtered queries wait for the already scheduled total request.',
    input: { ...baseInput, discovery: needsTotal, cacheEntries: [], inFlightQueryKeys: [needsTotal.queryKey] },
  },
  {
    id: 'offline-total-request',
    label: 'Offline · skip remote total',
    description: 'Offline reads cannot schedule Woo total discovery and must keep the lane incomplete.',
    input: { ...baseInput, discovery: needsTotal, connectivity: 'offline', cacheEntries: [] },
  },
  {
    id: 'enqueue-total-request',
    label: 'Exact-limit filtered · enqueue',
    description: 'An online exact-limit filtered query without cache or in-flight work schedules a minimal Woo list request.',
    input: { ...baseInput, discovery: needsTotal, cacheEntries: [] },
  },
  {
    id: 'not-needed-bounded-query',
    label: 'Bounded query · no request',
    description: 'Queries that are already bounded by local evidence do not need query-specific total scheduling.',
    input: { ...baseInput, discovery: notNeeded, cacheEntries: [] },
  },
];

export function summarizeQueryTotalRequestScenarios(): QueryTotalRequestScenarioSummary[] {
  return queryTotalRequestScenarios.map((scenario) => {
    const decision = planQueryTotalRequest(scenario.input);
    return {
      scenarioId: scenario.id,
      label: scenario.label,
      action: decision.action,
      reason: decision.reason,
      cacheStatus: decision.cacheStatus,
      totalMatchingRecords: decision.totalMatchingRecords,
      requestEndpoint: decision.request ? `${decision.request.method} ${decision.request.endpoint}` : null,
      requestParams: decision.request?.params ?? null,
    };
  });
}
