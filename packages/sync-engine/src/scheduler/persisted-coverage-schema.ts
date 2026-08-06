export type PersistedCoverageRecord = {
	collection: string;
	id: string;
	coveredQueryKeys: string[];
	freshUntilMs: number;
	updatedAtMs: number;
};

/**
 * Where a fetch-to-completion (ranged `limit=all`) walk stopped, so the next pass resumes
 * from the boundary instead of re-downloading the same newest window forever (#954).
 *
 * The cursor is a DATE bound, not a page or an offset, because the wcpos/v2 `/orders` route
 * is a faithful pass-through to `wc/v3` (Catalog_Proxy_Controller::proxy) and `wc/v3` offers
 * no id bound — its cursor-shaped params are `page`, `offset`, `before`/`after` and
 * `exclude`. `page`/`offset` are POSITIONAL: an order inserted or trashed inside the range
 * mid-walk shifts every later position, which silently skips records. `before` is
 * CONTENT-addressed — "everything older than this instant is still owed" — so it survives
 * concurrent inserts and deletes untouched. It is paired with `excludeWooIds` because WP's
 * date columns have one-second resolution: the bound is re-requested INCLUSIVE of the
 * boundary second (`beforeSeconds` = last seen second + 1, and `before` is exclusive) and
 * the ids already taken from that second are excluded, so a tie group split across a page
 * boundary is neither missed nor re-downloaded.
 *
 * It lives on the coverage LANE — the same document as `expectedRecordIds` — deliberately.
 * A cursor that outlived the covered-id set (an `engineKv` blob would, since the ledger
 * rebuild only drops the coverage/scheduler collections) would resume mid-range against an
 * empty covered set and then declare the lane complete having never re-fetched the newest
 * part of the range. Co-locating them makes that state unrepresentable: every wipe that
 * clears the covered set — Clear & Sync (`registerCursorInvalidator`), a ledger rebuild
 * (`DERIVABLE_METADATA_COLLECTIONS`), coverage compaction — clears the cursor with it.
 */
export type RangedLaneResumeState = {
	/**
	 * The EXCLUSIVE `before` bound (epoch seconds) for the next pass. Records at
	 * `beforeSeconds - 1` are re-requested and filtered by `excludeWooIds`.
	 */
	beforeSeconds: number;
	/** Woo ids already covered at exactly `beforeSeconds - 1` — the boundary second's tie group. */
	excludeWooIds: number[];
	/**
	 * Best known size of the WHOLE range (ids already covered + the server's `X-WP-Total`
	 * for the uncovered remainder) — the denominator the Reports progress line shows.
	 * `null` when the server sent no total header.
	 */
	totalRecords: number | null;
};

export type PersistedCoverageLane = {
	collection: string;
	queryKey: string;
	complete: boolean;
	expectedRecordIds: string[];
	freshUntilMs: number;
	updatedAtMs: number;
	/** Present only while a ranged fetch-to-completion walk is mid-flight — see RangedLaneResumeState. */
	rangedResume?: RangedLaneResumeState;
};

export type LocalRecordCoverage = Pick<PersistedCoverageRecord, 'collection' | 'id'> & {
	fresh: boolean;
};

export type LocalLaneCoverage = Pick<
	PersistedCoverageLane,
	'collection' | 'queryKey' | 'complete'
> & { fresh: boolean };

export type LocalCoverageState = {
	records: LocalRecordCoverage[];
	lanes: LocalLaneCoverage[];
};

export type PersistedCoverageDocumentSet = {
	records: PersistedCoverageRecord[];
	lanes: PersistedCoverageLane[];
};

export type ToLocalCoverageStateInput = {
	documents: PersistedCoverageDocumentSet;
	nowMs: number;
};

export type ExpectedRecordIdsForLaneInput = ToLocalCoverageStateInput & {
	collection: string;
	queryKey: string;
};

export type PersistedCoverageRetentionAction = 'keep' | 'refresh' | 'remove';
export type PersistedCoverageDocumentType = 'record' | 'lane';

export type PersistedCoverageRetentionDecision = {
	documentType: PersistedCoverageDocumentType;
	collection: string;
	key: string;
	action: PersistedCoverageRetentionAction;
	reason: string;
};

export type PlanPersistedCoverageRetentionInput = ToLocalCoverageStateInput & {
	retainStaleForMs: number;
};

export type PersistedCoverageCompactionResult = {
	documents: PersistedCoverageDocumentSet;
	decisions: PersistedCoverageRetentionDecision[];
	removed: PersistedCoverageRetentionDecision[];
};

export const coverageSchemaIndexes = {
	records: [
		['collection', 'id'],
		['collection', 'freshUntilMs'],
	],
	lanes: [
		['collection', 'queryKey'],
		['collection', 'freshUntilMs'],
	],
} as const;

function isFresh(freshUntilMs: number, nowMs: number): boolean {
	return freshUntilMs > nowMs;
}

function retentionDecision(input: {
	documentType: PersistedCoverageDocumentType;
	collection: string;
	key: string;
	freshUntilMs: number;
	nowMs: number;
	retainStaleForMs: number;
}): PersistedCoverageRetentionDecision {
	if (isFresh(input.freshUntilMs, input.nowMs)) {
		return {
			documentType: input.documentType,
			collection: input.collection,
			key: input.key,
			action: 'keep',
			reason: 'coverage is still fresh',
		};
	}

	if (input.nowMs - input.freshUntilMs <= input.retainStaleForMs) {
		return {
			documentType: input.documentType,
			collection: input.collection,
			key: input.key,
			action: 'refresh',
			reason: 'coverage is stale but still inside retention window',
		};
	}

	return {
		documentType: input.documentType,
		collection: input.collection,
		key: input.key,
		action: 'remove',
		reason: 'coverage is stale beyond retention window',
	};
}

export function toLocalCoverageState(input: ToLocalCoverageStateInput): LocalCoverageState {
	return {
		records: input.documents.records.map((record) => ({
			collection: record.collection,
			id: record.id,
			fresh: isFresh(record.freshUntilMs, input.nowMs),
		})),
		lanes: input.documents.lanes.map((lane) => ({
			collection: lane.collection,
			queryKey: lane.queryKey,
			complete: lane.complete,
			fresh: isFresh(lane.freshUntilMs, input.nowMs),
		})),
	};
}

export function expectedRecordIdsForLane(input: ExpectedRecordIdsForLaneInput): string[] {
	const lane = input.documents.lanes.find(
		(candidate) =>
			candidate.collection === input.collection &&
			candidate.queryKey === input.queryKey &&
			candidate.complete &&
			isFresh(candidate.freshUntilMs, input.nowMs)
	);

	return lane ? [...lane.expectedRecordIds] : [];
}

export function planPersistedCoverageRetention(
	input: PlanPersistedCoverageRetentionInput
): PersistedCoverageRetentionDecision[] {
	return [
		...input.documents.records.map((record) =>
			retentionDecision({
				documentType: 'record' as const,
				collection: record.collection,
				key: record.id,
				freshUntilMs: record.freshUntilMs,
				nowMs: input.nowMs,
				retainStaleForMs: input.retainStaleForMs,
			})
		),
		...input.documents.lanes.map((lane) =>
			retentionDecision({
				documentType: 'lane' as const,
				collection: lane.collection,
				key: lane.queryKey,
				freshUntilMs: lane.freshUntilMs,
				nowMs: input.nowMs,
				retainStaleForMs: input.retainStaleForMs,
			})
		),
	];
}

export function compactPersistedCoverageDocuments(
	input: PlanPersistedCoverageRetentionInput
): PersistedCoverageCompactionResult {
	const decisions = planPersistedCoverageRetention(input);
	const removedRecordKeys = new Set(
		decisions
			.filter((decision) => decision.documentType === 'record' && decision.action === 'remove')
			.map((decision) => `${decision.collection}::${decision.key}`)
	);
	const removedLaneKeys = new Set(
		decisions
			.filter((decision) => decision.documentType === 'lane' && decision.action === 'remove')
			.map((decision) => `${decision.collection}::${decision.key}`)
	);

	return {
		documents: {
			records: input.documents.records.filter(
				(record) => !removedRecordKeys.has(`${record.collection}::${record.id}`)
			),
			lanes: input.documents.lanes.filter(
				(lane) => !removedLaneKeys.has(`${lane.collection}::${lane.queryKey}`)
			),
		},
		decisions,
		removed: decisions.filter((decision) => decision.action === 'remove'),
	};
}
