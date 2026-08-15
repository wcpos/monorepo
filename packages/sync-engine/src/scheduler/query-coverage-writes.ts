import type {
	PersistedCoverageDocumentSet,
	RangedLaneResumeState,
} from './persisted-coverage-schema';

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
	/**
	 * The prefix a growing browse window carried forward from a SMALLER lane, re-checked by
	 * the write itself (#1030 residual). The fetcher already checks it before walking, but
	 * that read and this write are two operations and `withLedgerRecovery` re-invokes the
	 * write with the SAME arguments after a corruption refusal drops `coverageLanes` —
	 * replaying a prefix the pre-read approved onto a store that no longer holds it. Because
	 * this check lives inside the replayed call, the replay re-runs it and demotes instead.
	 */
	prefixAncestry?: {
		/** The smaller lane the prefix was taken from. */
		sourceQueryKey: string;
		/** The ids that must still be a prefix of that lane. */
		recordIds: readonly string[];
		/** What to record instead when the lineage is gone: this pass's delta alone. */
		fallbackRecordIds: readonly string[];
	};
};

export type BuildCumulativeCoverageDocumentsFromQueryResultInput =
	BuildCoverageDocumentsFromQueryResultInput & {
		resetCumulativeExpectedIds?: boolean;
		/**
		 * The ranged walk's continuation cursor (#954). `undefined` leaves whatever the lane
		 * already carries alone (the greedy custom-pull lane never sets it); an explicit `null`
		 * CLEARS it — the walk finished, so there is nothing left to resume from.
		 */
		rangedResume?: RangedLaneResumeState | null;
		/**
		 * The cursor the pass STARTED from (`null` = it started a fresh walk). The write is only
		 * allowed to advance the cursor if the stored one still matches this; anything else means
		 * the lane was wiped or moved mid-pass, and advancing would strand the records the pass
		 * believed were already covered. Only read when `rangedResume` is present.
		 */
		rangedResumeExpected?: RangedLaneResumeState | null;
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
