import {
	expectedRecordIdsForLane,
	type PersistedCoverageDocumentSet,
	toLocalCoverageState,
} from './persisted-coverage-schema';
import {
	type QueryRequirementDeclaration,
	type QueryRequirementFlowResult,
	runQueryRequirementFlow,
} from './query-requirement-library';

import type { ConnectivityMode } from './replication-policy';
import type { SchedulerFetcher } from './replication-scheduler';

export type PersistedCoverageQueryRequirementFlowInput = {
	connectivity: ConnectivityMode;
	documents: PersistedCoverageDocumentSet;
	nowMs: number;
	declarations: QueryRequirementDeclaration[];
	fetcher: SchedulerFetcher;
};

function declarationWithPersistedExpectedIds(
	declaration: QueryRequirementDeclaration,
	documents: PersistedCoverageDocumentSet,
	nowMs: number
): QueryRequirementDeclaration {
	if (declaration.kind === 'targeted-records' || declaration.expectedRecordIds !== undefined) {
		return declaration;
	}

	return {
		...declaration,
		expectedRecordIds: expectedRecordIdsForLane({
			documents,
			collection: declaration.collection,
			queryKey: declaration.queryKey,
			nowMs,
		}),
	};
}

export function buildDeclarationsFromPersistedCoverage(input: {
	documents: PersistedCoverageDocumentSet;
	nowMs: number;
	declarations: QueryRequirementDeclaration[];
}): QueryRequirementDeclaration[] {
	return input.declarations.map((declaration) =>
		declarationWithPersistedExpectedIds(declaration, input.documents, input.nowMs)
	);
}

export async function runPersistedCoverageQueryRequirementFlow(
	input: PersistedCoverageQueryRequirementFlowInput
): Promise<QueryRequirementFlowResult> {
	return runQueryRequirementFlow({
		connectivity: input.connectivity,
		coverageState: toLocalCoverageState({ documents: input.documents, nowMs: input.nowMs }),
		declarations: buildDeclarationsFromPersistedCoverage({
			documents: input.documents,
			nowMs: input.nowMs,
			declarations: input.declarations,
		}),
		fetcher: input.fetcher,
	});
}
