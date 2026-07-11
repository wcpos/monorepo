import { planQueryTotalRequestLifecycle, type QueryTotalRequestLifecycleDecision, type QueryTotalRequestLifecycleInput, type QueryTotalRequestState } from './query-total-request-lifecycle';

export type QueryTotalRequestLifecycleScenario = {
  id: string;
  label: string;
  description: string;
  input: QueryTotalRequestLifecycleInput;
};

export type QueryTotalRequestLifecycleScenarioSummary = Pick<QueryTotalRequestLifecycleDecision,
  'action' | 'reason' | 'ownerStatus' | 'retryStatus' | 'nextAttempt'
> & {
  scenarioId: string;
  label: string;
  requestEndpoint: string | null;
  requestParams: Record<string, string | number | boolean> | null;
};

const needsTotal = {
  queryKey: 'orders:browser:status=processing:search=:limit=50',
  action: 'request-query-total' as const,
  reason: 'filtered exact-limit query needs a query-specific Woo total before expected ids are trusted',
  complete: false,
  shouldRequestQueryTotal: true,
  totalMatchingRecords: null,
};

const baseInput = {
  discovery: needsTotal,
  endpoint: '/wp-json/wc/v3/orders',
  filters: { status: 'processing' },
  nowMs: 1_500,
  ownerId: 'tab-a',
  connectivity: 'online' as const,
  cacheEntries: [],
  requestStates: [],
};

function requestState(overrides: Partial<QueryTotalRequestState>): QueryTotalRequestState {
  return {
    queryKey: needsTotal.queryKey,
    status: 'in-flight',
    ownerId: 'tab-b',
    claimedUntilMs: 2_000,
    attempt: 1,
    retryAfterMs: null,
    updatedAtMs: 1_000,
    request: null,
    ...overrides,
  };
}

export const queryTotalRequestLifecycleScenarios: QueryTotalRequestLifecycleScenario[] = [
  {
    id: 'fresh-cache-use-total',
    label: 'Fresh cache · use total',
    description: 'Fresh durable query-total evidence wins before any request ownership or retry state is considered.',
    input: {
      ...baseInput,
      cacheEntries: [{ queryKey: needsTotal.queryKey, totalMatchingRecords: 50, freshUntilMs: 2_000, updatedAtMs: 1_100 }],
      requestStates: [requestState({ status: 'in-flight', claimedUntilMs: 2_000 })],
    },
  },
  {
    id: 'active-owner-wait',
    label: 'Active owner · wait',
    description: 'A second tab should not duplicate a query-total probe while another owner lease is still active.',
    input: {
      ...baseInput,
      requestStates: [requestState({ status: 'in-flight', ownerId: 'tab-b', claimedUntilMs: 2_000 })],
    },
  },
  {
    id: 'expired-owner-take-over',
    label: 'Expired owner · take over',
    description: 'An expired owner lease can be claimed by the current tab and retried as the next attempt.',
    input: {
      ...baseInput,
      requestStates: [requestState({ status: 'in-flight', ownerId: 'tab-b', claimedUntilMs: 1_400 })],
    },
  },
  {
    id: 'retry-backoff-wait',
    label: 'Retry backoff · wait',
    description: 'A failed request whose retry-after time has not elapsed remains unowned but unavailable.',
    input: {
      ...baseInput,
      requestStates: [requestState({ status: 'failed', ownerId: null, claimedUntilMs: null, attempt: 2, retryAfterMs: 1_800 })],
    },
  },
  {
    id: 'retry-due-claim',
    label: 'Retry due · claim',
    description: 'A failed request whose backoff has elapsed can be claimed for the next attempt.',
    input: {
      ...baseInput,
      requestStates: [requestState({ status: 'failed', ownerId: null, claimedUntilMs: null, attempt: 2, retryAfterMs: 1_400 })],
    },
  },
  {
    id: 'offline-skip-claim',
    label: 'Offline · skip claim',
    description: 'Offline tabs do not claim durable query-total work because they cannot contact Woo.',
    input: { ...baseInput, connectivity: 'offline' },
  },
  {
    id: 'no-state-claim',
    label: 'No state · claim',
    description: 'Online exact-limit filtered queries without cache or durable lifecycle state can be claimed immediately.',
    input: baseInput,
  },
];

export function summarizeQueryTotalRequestLifecycleScenarios(): QueryTotalRequestLifecycleScenarioSummary[] {
  return queryTotalRequestLifecycleScenarios.map((scenario) => {
    const decision = planQueryTotalRequestLifecycle(scenario.input);
    return {
      scenarioId: scenario.id,
      label: scenario.label,
      action: decision.action,
      reason: decision.reason,
      ownerStatus: decision.ownerStatus,
      retryStatus: decision.retryStatus,
      nextAttempt: decision.nextAttempt,
      requestEndpoint: decision.request ? `${decision.request.method} ${decision.request.endpoint}` : null,
      requestParams: decision.request?.params ?? null,
    };
  });
}
