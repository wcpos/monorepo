import { runSchedulerCoverageFlow, summarizeSchedulerCoverageFlowResult, type SchedulerCoverageFlowRequirement, type SchedulerCoverageFlowResult } from './scheduler-coverage-flow';
import type { ConnectivityMode, FetchTask, FetchTaskResult, ReplicationRequirement } from './replication-policy';

export type SchedulerCoverageFlowScenario = {
  id: string;
  label: string;
  description: string;
  connectivity: ConnectivityMode;
  requirements: SchedulerCoverageFlowRequirement[];
};

function requirement(overrides: Partial<ReplicationRequirement> & Pick<ReplicationRequirement, 'id' | 'collection'>): ReplicationRequirement {
  return {
    id: overrides.id,
    collection: overrides.collection,
    kind: overrides.kind ?? 'query',
    queryKey: overrides.queryKey ?? overrides.id,
    ids: overrides.ids,
    policy: {
      mode: overrides.policy?.mode ?? 'windowed',
      priority: overrides.policy?.priority ?? 100,
      batchSize: overrides.policy?.batchSize ?? 10,
      maxRequests: overrides.policy?.maxRequests,
      pollingIntervalMs: overrides.policy?.pollingIntervalMs,
      staleAfterMs: overrides.policy?.staleAfterMs,
      offline: overrides.policy?.offline ?? { read: 'serve-local', write: 'queue' },
    },
  };
}

function coverage(requirementInput: ReplicationRequirement, options: Omit<SchedulerCoverageFlowRequirement, 'requirement' | 'coverageStrategy'> & Partial<Pick<SchedulerCoverageFlowRequirement, 'coverageStrategy'>>): SchedulerCoverageFlowRequirement {
  return {
    requirement: requirementInput,
    coverageStrategy: options.coverageStrategy ?? 'record-and-lane',
    coverageState: options.coverageState,
    expectedRecordIds: options.expectedRecordIds,
  };
}

const defaultCustomer = requirement({
  id: 'customers.default',
  collection: 'customers',
  kind: 'targeted-records',
  queryKey: 'customers:ids:default',
  ids: ['customer:default'],
  policy: { mode: 'on-demand', priority: 950, batchSize: 1, offline: { read: 'fail-if-missing', write: 'queue' } },
});

const deepLinkedOrder = requirement({
  id: 'orders.deepLink.114',
  collection: 'orders',
  kind: 'targeted-records',
  queryKey: 'orders:ids:114',
  ids: ['woo-order:114'],
  policy: { mode: 'on-demand', priority: 900, batchSize: 1, offline: { read: 'fail-if-missing', write: 'queue' } },
});

const taxRates = requirement({
  id: 'taxRates.all',
  collection: 'taxRates',
  kind: 'lane',
  queryKey: 'taxRates:all',
  policy: { mode: 'greedy', priority: 1000, batchSize: 10, maxRequests: 5, offline: { read: 'fail-if-missing', write: 'reject' } },
});

const productSearch = requirement({
  id: 'products.search.keyboard',
  collection: 'products',
  queryKey: 'products:search:keyboard',
  policy: { mode: 'windowed', priority: 900, batchSize: 10, offline: { read: 'serve-local', write: 'queue' } },
});

const productBackgroundPoll = requirement({
  id: 'products.backgroundPoll',
  collection: 'products',
  kind: 'lane',
  queryKey: 'products:background-poll',
  policy: { mode: 'windowed', priority: 100, batchSize: 25, pollingIntervalMs: 120_000, offline: { read: 'serve-local', write: 'queue' } },
});

export const schedulerCoverageFlowScenarios: SchedulerCoverageFlowScenario[] = [
  {
    id: 'pos-startup-coverage-gated',
    label: 'POS startup coverage gated',
    description: 'Checks startup dependencies against local coverage before scheduling only missing remote work.',
    connectivity: 'online',
    requirements: [
      coverage(defaultCustomer, { coverageState: { records: [{ collection: 'customers', id: 'customer:default', fresh: true }], lanes: [] } }),
      coverage(deepLinkedOrder, { coverageState: { records: [{ collection: 'orders', id: 'woo-order:114', fresh: true }], lanes: [] } }),
      coverage(taxRates, { coverageState: { records: [], lanes: [] } }),
    ],
  },
  {
    id: 'product-search-preemption',
    label: 'Product search preemption',
    description: 'Lets a query-triggered product search jump ahead of lower-priority background polling after coverage filters both as remote work.',
    connectivity: 'online',
    requirements: [
      coverage(productSearch, { coverageState: { records: [], lanes: [] }, expectedRecordIds: ['product:keyboard'] }),
      coverage(productBackgroundPoll, { coverageState: { records: [], lanes: [] } }),
    ],
  },
  {
    id: 'targeted-order-lookup',
    label: 'Targeted order lookup',
    description: 'Serves a fresh targeted order locally and avoids scheduling a remote fetch for that deep-link requirement.',
    connectivity: 'online',
    requirements: [coverage(deepLinkedOrder, { coverageState: { records: [{ collection: 'orders', id: 'woo-order:114', fresh: true }], lanes: [] } })],
  },
  {
    id: 'offline-local-only',
    label: 'Offline local only',
    description: 'Serves covered local data while reporting missing fail-if-missing requirements as offline skips.',
    connectivity: 'offline',
    requirements: [
      coverage(defaultCustomer, { coverageState: { records: [{ collection: 'customers', id: 'customer:default', fresh: true }], lanes: [] } }),
      coverage(deepLinkedOrder, { coverageState: { records: [], lanes: [] } }),
    ],
  },
  {
    id: 'mixed-record-and-lane-coverage',
    label: 'Mixed record and lane coverage',
    description: 'Requires both a complete fresh lane and fresh expected records before serving a query locally.',
    connectivity: 'online',
    requirements: [coverage(productSearch, {
      coverageState: {
        records: [{ collection: 'products', id: 'product:keyboard', fresh: true }],
        lanes: [{ collection: 'products', queryKey: 'products:search:keyboard', complete: true, fresh: true }],
      },
      expectedRecordIds: ['product:keyboard'],
    })],
  },
];

async function deterministicFetcher(task: FetchTask): Promise<FetchTaskResult> {
  return { taskId: task.id, documentCount: task.ids?.length ?? task.limit, requestCount: 1, completed: true };
}

export function runSchedulerCoverageFlowScenario(scenario: SchedulerCoverageFlowScenario): Promise<SchedulerCoverageFlowResult> {
  return runSchedulerCoverageFlow({ connectivity: scenario.connectivity, requirements: scenario.requirements, fetcher: deterministicFetcher });
}

export async function summarizeSchedulerCoverageFlowScenario(scenario: SchedulerCoverageFlowScenario): Promise<string> {
  return summarizeSchedulerCoverageFlowResult(await runSchedulerCoverageFlowScenario(scenario));
}
