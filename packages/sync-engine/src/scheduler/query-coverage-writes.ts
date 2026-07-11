import type { PersistedCoverageDocumentSet } from './persisted-coverage-schema';

export type QueryCoverageResultRecord = {
	id: string;
};

export type QueryCoverageCompletenessEvidence = {
	returnedRecordCount: number;
	totalMatchingRecords: number | null;
};

export function deriveQueryCoverageCompleteness(input: QueryCoverageCompletenessEvidence): boolean {
	return (
		input.totalMatchingRecords !== null && input.returnedRecordCount === input.totalMatchingRecords
	);
}

export type BuildCoverageDocumentsFromQueryResultInput = {
	collection: string;
	queryKey: string;
	records: QueryCoverageResultRecord[];
	complete: boolean;
	nowMs: number;
	freshForMs: number;
};

export type BuildCumulativeCoverageDocumentsFromQueryResultInput =
	BuildCoverageDocumentsFromQueryResultInput & {
		resetCumulativeExpectedIds?: boolean;
	};

export function buildCoverageDocumentsFromQueryResult(
	input: BuildCoverageDocumentsFromQueryResultInput
): PersistedCoverageDocumentSet {
	const freshUntilMs = input.nowMs + input.freshForMs;
	const expectedRecordIds = input.records.map((record) => record.id);

	return {
		records: input.records.map((record) => ({
			collection: input.collection,
			id: record.id,
			coveredQueryKeys: [input.queryKey],
			freshUntilMs,
			updatedAtMs: input.nowMs,
		})),
		lanes: [
			{
				collection: input.collection,
				queryKey: input.queryKey,
				complete: input.complete,
				expectedRecordIds,
				freshUntilMs,
				updatedAtMs: input.nowMs,
			},
		],
	};
}
