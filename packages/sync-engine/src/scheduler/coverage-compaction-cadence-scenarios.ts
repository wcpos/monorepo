import {
	type CoverageCompactionCadenceDecision,
	type CoverageCompactionCadenceInput,
	planCoverageCompactionCadence,
} from './coverage-compaction-cadence';

export type CoverageCompactionCadenceScenario = {
	id: string;
	label: string;
	description: string;
	input: CoverageCompactionCadenceInput;
};

export type CoverageCompactionCadenceScenarioSummary = Pick<
	CoverageCompactionCadenceDecision,
	| 'action'
	| 'reason'
	| 'expiredDocuments'
	| 'refreshableDocuments'
	| 'keepDocuments'
	| 'ownerId'
	| 'previousOwnerId'
	| 'nextDueAtMs'
> & {
	scenarioId: string;
	label: string;
};

const freshLane = {
	collection: 'orders',
	queryKey: 'orders:open',
	complete: true,
	expectedRecordIds: ['order-1'],
	freshUntilMs: 2_000,
	updatedAtMs: 1_000,
};
const expiredRecord = {
	collection: 'orders',
	id: 'order-expired',
	coveredQueryKeys: ['orders:open'],
	freshUntilMs: 700,
	updatedAtMs: 600,
};
const refreshableRecord = {
	collection: 'orders',
	id: 'order-refresh',
	coveredQueryKeys: ['orders:open'],
	freshUntilMs: 950,
	updatedAtMs: 900,
};

const baseInput = {
	tabId: 'tab-a',
	nowMs: 1_000,
	intervalMs: 300,
	retainStaleForMs: 100,
	minExpiredDocuments: 1,
	lastCompactedAtMs: 500,
};

export const coverageCompactionCadenceScenarios: CoverageCompactionCadenceScenario[] = [
	{
		id: 'expired-coverage-no-owner',
		label: 'Expired coverage · no owner',
		description:
			'Current tab can run compaction when expired persisted coverage is due and no lease is active.',
		input: { ...baseInput, documents: { records: [expiredRecord], lanes: [freshLane] } },
	},
	{
		id: 'refreshable-stale-coverage',
		label: 'Refreshable stale coverage · no compaction',
		description:
			'Stale coverage inside the retention window remains available for refresh and should not trigger compaction.',
		input: { ...baseInput, documents: { records: [refreshableRecord], lanes: [freshLane] } },
	},
	{
		id: 'expired-coverage-active-owner',
		label: 'Expired coverage · active owner',
		description: 'Current tab waits when another tab owns an unexpired compaction lease.',
		input: {
			...baseInput,
			documents: { records: [expiredRecord], lanes: [freshLane] },
			lease: { ownerId: 'tab-b', acquiredAtMs: 900, expiresAtMs: 1_200 },
		},
	},
	{
		id: 'expired-coverage-expired-owner',
		label: 'Expired coverage · expired owner',
		description: 'Current tab may take over when the previous owner lease has expired.',
		input: {
			...baseInput,
			documents: { records: [expiredRecord], lanes: [freshLane] },
			lease: { ownerId: 'tab-b', acquiredAtMs: 400, expiresAtMs: 900 },
		},
	},
	{
		id: 'expired-coverage-failure-backoff',
		label: 'Expired coverage · failure backoff',
		description:
			'Current tab waits before retrying destructive compaction when the previous attempt failed recently.',
		input: {
			...baseInput,
			documents: { records: [expiredRecord], lanes: [freshLane] },
			failedCompaction: { failedAtMs: 900, retryAfterMs: 1_200 },
		},
	},
];

export function summarizeCoverageCompactionCadenceScenarios(): CoverageCompactionCadenceScenarioSummary[] {
	return coverageCompactionCadenceScenarios.map((scenario) => {
		const decision = planCoverageCompactionCadence(scenario.input);
		return {
			scenarioId: scenario.id,
			label: scenario.label,
			action: decision.action,
			reason: decision.reason,
			expiredDocuments: decision.expiredDocuments,
			refreshableDocuments: decision.refreshableDocuments,
			keepDocuments: decision.keepDocuments,
			ownerId: decision.ownerId,
			previousOwnerId: decision.previousOwnerId,
			nextDueAtMs: decision.nextDueAtMs,
		};
	});
}
