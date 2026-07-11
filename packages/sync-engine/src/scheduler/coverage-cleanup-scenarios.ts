import { planCoverageCleanup, type CoverageCleanupAction, type CoverageCleanupInput } from './coverage-cleanup';

export type CoverageCleanupScenario = {
  id: string;
  label: string;
  input: CoverageCleanupInput;
};

export type CoverageCleanupScenarioSummary = {
  scenarioId: string;
} & Record<CoverageCleanupAction, number>;

export const coverageCleanupScenarios: CoverageCleanupScenario[] = [
  {
    id: 'open-orders-stale-expected-record',
    label: 'Open orders lane · stale expected record',
    input: {
      collection: 'orders',
      queryKey: 'orders:status:open-recent',
      expectedRecordIds: ['woo-order:open-1', 'woo-order:open-2'],
      records: [
        { collection: 'orders', id: 'woo-order:open-1', fresh: false, coveredQueryKeys: ['orders:status:open-recent'] },
        { collection: 'orders', id: 'woo-order:open-2', fresh: true, coveredQueryKeys: ['orders:status:open-recent'] },
      ],
    },
  },
  {
    id: 'product-lane-out-of-lane-record',
    label: 'Product lane · local out-of-lane record',
    input: {
      collection: 'products',
      queryKey: 'products:initial:alphabetical',
      expectedRecordIds: ['product:alpha'],
      records: [
        { collection: 'products', id: 'product:alpha', fresh: true, coveredQueryKeys: ['products:initial:alphabetical'] },
        { collection: 'products', id: 'product:archived', fresh: true, coveredQueryKeys: ['products:initial:alphabetical'] },
      ],
    },
  },
  {
    id: 'orders-lane-mixed-cleanup',
    label: 'Orders lane · keep refresh and remove',
    input: {
      collection: 'orders',
      queryKey: 'orders:status:open-recent',
      expectedRecordIds: ['woo-order:open-3', 'woo-order:open-4'],
      records: [
        { collection: 'orders', id: 'woo-order:open-3', fresh: true, coveredQueryKeys: ['orders:status:open-recent'] },
        { collection: 'orders', id: 'woo-order:open-4', fresh: false, coveredQueryKeys: ['orders:status:open-recent'] },
        { collection: 'orders', id: 'woo-order:closed-12', fresh: true, coveredQueryKeys: ['orders:status:open-recent'] },
      ],
    },
  },
];

export function summarizeCoverageCleanupScenarios(scenarios: CoverageCleanupScenario[]): CoverageCleanupScenarioSummary[] {
  return scenarios.map((scenario) => {
    const summary: CoverageCleanupScenarioSummary = { scenarioId: scenario.id, keep: 0, refresh: 0, remove: 0 };
    for (const decision of planCoverageCleanup(scenario.input)) {
      summary[decision.action] += 1;
    }
    return summary;
  });
}
