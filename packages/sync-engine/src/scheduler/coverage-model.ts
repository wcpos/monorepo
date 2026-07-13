import type { ReplicationRequirement } from './replication-policy';

export type CoverageStrategy = 'record-only' | 'lane-only' | 'record-and-lane';
export type CoverageDecisionAction = 'serve-local' | 'fetch-remote';

export type LocalRecordCoverage = {
	collection: string;
	id: string;
	fresh: boolean;
};

export type LocalLaneCoverage = {
	collection: string;
	queryKey: string;
	complete: boolean;
	fresh: boolean;
};

export type LocalCoverageState = {
	records: LocalRecordCoverage[];
	lanes: LocalLaneCoverage[];
};

export type CoverageEvaluationCase = {
	id: string;
	label: string;
	requirement: ReplicationRequirement;
	state: LocalCoverageState;
	expectedRecordIds?: string[];
	currentRecordIds?: string[];
	totalMatchingRecords?: number | null;
};

export type CoverageEvaluationInput = {
	strategy: CoverageStrategy;
	state: LocalCoverageState;
	requirement: ReplicationRequirement;
	expectedRecordIds?: string[];
	currentRecordIds?: string[];
	totalMatchingRecords?: number | null;
};

export type CoverageDecision = {
	strategy: CoverageStrategy;
	requirementId: string;
	action: CoverageDecisionAction;
	reason: string;
	missingRecordIds: string[];
	risks: string[];
};

export type CoverageComparisonResult = CoverageDecision & {
	caseId: string;
	caseLabel: string;
};

export const coverageStrategies: CoverageStrategy[] = [
	'record-only',
	'lane-only',
	'record-and-lane',
];

function requiredRecordIds(
	requirement: ReplicationRequirement,
	expectedRecordIds: string[] = []
): string[] {
	return requirement.kind === 'targeted-records' ? (requirement.ids ?? []) : expectedRecordIds;
}

function freshRecordIds(state: LocalCoverageState, collection: string): Set<string> {
	return new Set(
		state.records
			.filter((record) => record.collection === collection && record.fresh)
			.map((record) => record.id)
	);
}

function missingFreshRecordIds(
	state: LocalCoverageState,
	requirement: ReplicationRequirement,
	expectedRecordIds?: string[]
): string[] {
	const localFreshIds = freshRecordIds(state, requirement.collection);
	return requiredRecordIds(requirement, expectedRecordIds).filter((id) => !localFreshIds.has(id));
}

function findFreshCompleteLane(
	state: LocalCoverageState,
	requirement: ReplicationRequirement
): LocalLaneCoverage | undefined {
	return state.lanes.find(
		(lane) =>
			lane.collection === requirement.collection &&
			lane.queryKey === requirement.queryKey &&
			lane.complete &&
			lane.fresh
	);
}

function currentQueryEvidenceFailure(input: CoverageEvaluationInput): string | null {
	if (input.requirement.kind === 'targeted-records' || input.expectedRecordIds === undefined)
		return null;

	const expectedIds = new Set(input.expectedRecordIds);
	const currentRecordIds = input.currentRecordIds ?? [];
	if (currentRecordIds.some((id) => !expectedIds.has(id))) {
		return 'current query records are not covered by the complete lane expected ids';
	}

	if (
		input.totalMatchingRecords !== null &&
		typeof input.totalMatchingRecords !== 'undefined' &&
		input.totalMatchingRecords > input.expectedRecordIds.length
	) {
		return 'current query evidence proves more matching records than the complete lane expected';
	}

	return null;
}

function recordDecision(input: CoverageEvaluationInput): CoverageDecision {
	const missingRecordIds = missingFreshRecordIds(
		input.state,
		input.requirement,
		input.expectedRecordIds
	);
	if (
		missingRecordIds.length === 0 &&
		requiredRecordIds(input.requirement, input.expectedRecordIds).length > 0
	) {
		return {
			strategy: input.strategy,
			requirementId: input.requirement.id,
			action: 'serve-local',
			reason: 'all required records are fresh locally',
			missingRecordIds: [],
			risks:
				input.requirement.kind === 'query'
					? ['record metadata alone does not prove the full query lane is complete']
					: [],
		};
	}

	return {
		strategy: input.strategy,
		requirementId: input.requirement.id,
		action: 'fetch-remote',
		reason:
			missingRecordIds.length > 0
				? 'one or more required records are missing or stale'
				: 'record-only coverage cannot prove query completeness without expected record ids',
		missingRecordIds,
		risks: [],
	};
}

function laneDecision(input: CoverageEvaluationInput): CoverageDecision {
	const lane = findFreshCompleteLane(input.state, input.requirement);
	if (lane) {
		return {
			strategy: input.strategy,
			requirementId: input.requirement.id,
			action: 'serve-local',
			reason: 'matching lane is complete and fresh',
			missingRecordIds: [],
			risks: ['lane metadata does not prove every expected record exists locally'],
		};
	}

	return {
		strategy: input.strategy,
		requirementId: input.requirement.id,
		action: 'fetch-remote',
		reason: 'no matching complete fresh lane coverage',
		missingRecordIds: [],
		risks: [],
	};
}

export function evaluateCoverageRequirement(input: CoverageEvaluationInput): CoverageDecision {
	if (input.strategy === 'record-only') return recordDecision(input);
	if (input.strategy === 'lane-only') return laneDecision(input);

	const lane = findFreshCompleteLane(input.state, input.requirement);
	const missingRecordIds = missingFreshRecordIds(
		input.state,
		input.requirement,
		input.expectedRecordIds
	);

	if (input.requirement.kind === 'targeted-records') {
		return recordDecision(input);
	}

	if (input.expectedRecordIds === undefined) {
		return {
			strategy: input.strategy,
			requirementId: input.requirement.id,
			action: 'fetch-remote',
			reason: 'record-and-lane coverage needs expected record ids to verify local records',
			missingRecordIds: [],
			risks: [],
		};
	}

	if (lane) {
		const evidenceFailure = currentQueryEvidenceFailure(input);
		if (evidenceFailure) {
			return {
				strategy: input.strategy,
				requirementId: input.requirement.id,
				action: 'fetch-remote',
				reason: evidenceFailure,
				missingRecordIds,
				risks: [],
			};
		}
	}

	if (lane && missingRecordIds.length === 0) {
		return {
			strategy: input.strategy,
			requirementId: input.requirement.id,
			action: 'serve-local',
			reason: 'matching lane is complete and all expected records are fresh locally',
			missingRecordIds: [],
			risks: [],
		};
	}

	return {
		strategy: input.strategy,
		requirementId: input.requirement.id,
		action: 'fetch-remote',
		reason: lane
			? 'lane is complete but expected records are missing or stale'
			: 'no matching complete fresh lane coverage',
		missingRecordIds,
		risks: [],
	};
}

export function runCoverageComparison(
	cases: CoverageEvaluationCase[],
	strategies: CoverageStrategy[] = coverageStrategies
): CoverageComparisonResult[] {
	return cases.flatMap((coverageCase) =>
		strategies.map((strategy) => ({
			...evaluateCoverageRequirement({
				strategy,
				state: coverageCase.state,
				requirement: coverageCase.requirement,
				expectedRecordIds: coverageCase.expectedRecordIds,
				currentRecordIds: coverageCase.currentRecordIds,
				totalMatchingRecords: coverageCase.totalMatchingRecords,
			}),
			caseId: coverageCase.id,
			caseLabel: coverageCase.label,
		}))
	);
}
