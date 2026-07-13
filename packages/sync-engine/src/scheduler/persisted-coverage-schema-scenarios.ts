import {
	expectedRecordIdsForLane,
	type PersistedCoverageDocumentSet,
	type PersistedCoverageRetentionAction,
	planPersistedCoverageRetention,
	toLocalCoverageState,
} from './persisted-coverage-schema';

export type PersistedCoverageSchemaScenario = {
	id: string;
	label: string;
	collection: string;
	queryKey: string;
	documents: PersistedCoverageDocumentSet;
	nowMs: number;
	retainStaleForMs: number;
};

export type PersistedCoverageSchemaScenarioSummary = {
	scenarioId: string;
	freshRecords: number;
	freshLanes: number;
	expectedRecordIds: string[];
} & Record<PersistedCoverageRetentionAction, number>;

export const persistedCoverageSchemaScenarios: PersistedCoverageSchemaScenario[] = [
	{
		id: 'persisted-open-orders-fresh',
		label: 'Open orders lane · fresh persisted coverage',
		collection: 'orders',
		queryKey: 'orders:status:open-recent',
		nowMs: 1_000,
		retainStaleForMs: 500,
		documents: {
			records: [
				{
					collection: 'orders',
					id: 'order-1',
					coveredQueryKeys: ['orders:status:open-recent'],
					freshUntilMs: 1_500,
					updatedAtMs: 900,
				},
				{
					collection: 'orders',
					id: 'order-2',
					coveredQueryKeys: ['orders:status:open-recent'],
					freshUntilMs: 1_500,
					updatedAtMs: 900,
				},
			],
			lanes: [
				{
					collection: 'orders',
					queryKey: 'orders:status:open-recent',
					complete: true,
					expectedRecordIds: ['order-1', 'order-2'],
					freshUntilMs: 1_500,
					updatedAtMs: 900,
				},
			],
		},
	},
	{
		id: 'persisted-products-stale-retained',
		label: 'Products lane · stale retained for refresh',
		collection: 'products',
		queryKey: 'products:initial:alphabetical',
		nowMs: 1_000,
		retainStaleForMs: 500,
		documents: {
			records: [
				{
					collection: 'products',
					id: 'product-alpha',
					coveredQueryKeys: ['products:initial:alphabetical'],
					freshUntilMs: 800,
					updatedAtMs: 700,
				},
				{
					collection: 'products',
					id: 'product-beta',
					coveredQueryKeys: ['products:initial:alphabetical'],
					freshUntilMs: 800,
					updatedAtMs: 700,
				},
			],
			lanes: [
				{
					collection: 'products',
					queryKey: 'products:initial:alphabetical',
					complete: true,
					expectedRecordIds: ['product-alpha', 'product-beta'],
					freshUntilMs: 800,
					updatedAtMs: 700,
				},
			],
		},
	},
	{
		id: 'persisted-orders-expired-removal',
		label: 'Orders lane · expired beyond retention',
		collection: 'orders',
		queryKey: 'orders:status:cancelled',
		nowMs: 1_000,
		retainStaleForMs: 100,
		documents: {
			records: [
				{
					collection: 'orders',
					id: 'order-cancelled',
					coveredQueryKeys: ['orders:status:cancelled'],
					freshUntilMs: 750,
					updatedAtMs: 700,
				},
			],
			lanes: [
				{
					collection: 'orders',
					queryKey: 'orders:status:cancelled',
					complete: true,
					expectedRecordIds: ['order-cancelled'],
					freshUntilMs: 750,
					updatedAtMs: 700,
				},
			],
		},
	},
];

export function summarizePersistedCoverageSchemaScenarios(
	scenarios: PersistedCoverageSchemaScenario[] = persistedCoverageSchemaScenarios
): PersistedCoverageSchemaScenarioSummary[] {
	return scenarios.map((scenario) => {
		const localState = toLocalCoverageState({
			documents: scenario.documents,
			nowMs: scenario.nowMs,
		});
		const retention = planPersistedCoverageRetention({
			documents: scenario.documents,
			nowMs: scenario.nowMs,
			retainStaleForMs: scenario.retainStaleForMs,
		});
		const summary: PersistedCoverageSchemaScenarioSummary = {
			scenarioId: scenario.id,
			freshRecords: localState.records.filter((record) => record.fresh).length,
			freshLanes: localState.lanes.filter((lane) => lane.fresh && lane.complete).length,
			expectedRecordIds: expectedRecordIdsForLane({
				documents: scenario.documents,
				collection: scenario.collection,
				queryKey: scenario.queryKey,
				nowMs: scenario.nowMs,
			}),
			keep: 0,
			refresh: 0,
			remove: 0,
		};

		for (const decision of retention) {
			summary[decision.action] += 1;
		}

		return summary;
	});
}

export function summarizePersistedCoverageSchemaScenario(
	scenario: PersistedCoverageSchemaScenario
): string {
	const summary = summarizePersistedCoverageSchemaScenarios([scenario])[0];
	return `${summary.freshRecords} fresh records, ${summary.freshLanes} fresh lane, ${summary.expectedRecordIds.length} expected ids, retention keep ${summary.keep} / refresh ${summary.refresh} / remove ${summary.remove}`;
}
