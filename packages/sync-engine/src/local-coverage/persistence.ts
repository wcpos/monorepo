import { assertBulkSuccess } from '@wcpos/sync-core';

import {
	buildCoverageDocumentsFromQueryResult,
	type BuildCoverageDocumentsFromQueryResultInput,
	type BuildCumulativeCoverageDocumentsFromQueryResultInput,
	compactPersistedCoverageDocuments,
	expectedRecordIdsForLane,
	type LocalCoverageState,
	type LocalRecordCoverage,
	mergePersistedCoverageWrites,
	type PersistedCoverageCompactionResult,
	type PersistedCoverageDocumentSet,
	type PersistedCoverageLane,
	type PersistedCoverageRecord,
	type PersistedCoverageRetentionDecision,
	type PlanPersistedCoverageRetentionInput,
	type QueryCoverageResultRecord,
	type RangedLaneResumeState,
	toLocalCoverageState,
} from '../scheduler';

import type { CoverageLaneDocument, CoverageRecordDocument } from './coverage-schema';

export type RxCoverageDocument<T> = {
	toJSON(withRevAndAttachments?: boolean): unknown;
	incrementalModify(
		mutationFunction: (
			document: T & { _deleted?: boolean }
		) => T | (T & { _deleted?: boolean }) | Promise<T | (T & { _deleted?: boolean })>
	): Promise<unknown>;
};

export type RecordCoverageRecordsInput = {
	collection: string;
	queryKey: string;
	records: QueryCoverageResultRecord[];
	nowMs: number;
	freshForMs: number;
};

export type LocalLaneCoverageWithExpectedRecords = {
	collection: string;
	queryKey: string;
	complete: boolean;
	fresh: boolean;
	expectedRecordIds: string[];
	/** The ranged walk's continuation cursor, when this lane is a mid-flight `limit=all` walk (#954). */
	rangedResume?: RangedLaneResumeState;
};

type RxCoverageCollection<T> = {
	bulkUpsert(items: T[]): Promise<unknown>;
	insert(item: T): Promise<unknown>;
	find(query?: unknown): { exec(): Promise<(RxCoverageDocument<T> | T)[]> };
	findOne(documentId: string): {
		exec(throwIfMissing: true): Promise<RxCoverageDocument<T>>;
		exec(): Promise<RxCoverageDocument<T> | null>;
	};
};

function toJson<T>(document: RxCoverageDocument<T> | T): T {
	return document && typeof document === 'object' && 'toJSON' in document
		? (document.toJSON() as T)
		: document;
}

export function coverageRecordKey(collection: string, id: string): string {
	return `${collection}::${id}`;
}

export function coverageLaneKey(collection: string, queryKey: string): string {
	return `${collection}::${queryKey}`;
}

function toRecordDocument(record: PersistedCoverageRecord): CoverageRecordDocument {
	const { collection, ...rest } = record;
	return {
		coverageKey: coverageRecordKey(collection, record.id),
		collectionName: collection,
		...rest,
		schemaVersion: 2,
	};
}

function toLaneDocument(lane: PersistedCoverageLane): CoverageLaneDocument {
	// `rangedResume` is destructured out and re-added conditionally: the storage validator
	// rejects a key present with an `undefined` value, so an optional field must be ABSENT.
	const { collection, rangedResume, ...rest } = lane;
	return {
		laneKey: coverageLaneKey(collection, lane.queryKey),
		collectionName: collection,
		...rest,
		...(rangedResume ? { rangedResume } : {}),
		schemaVersion: 3,
	};
}

function fromRecordDocument(
	document:
		| CoverageRecordDocument
		| (PersistedCoverageRecord & { coverageKey: string; schemaVersion?: number })
): PersistedCoverageRecord {
	const { coverageKey: _coverageKey, schemaVersion: _schemaVersion, ...record } = document;
	if ('collectionName' in record) {
		const { collectionName, ...rest } = record;
		return { collection: collectionName, ...rest };
	}
	return record;
}

function fromLaneDocument(
	document:
		CoverageLaneDocument | (PersistedCoverageLane & { laneKey: string; schemaVersion?: number })
): PersistedCoverageLane {
	const { laneKey: _laneKey, schemaVersion: _schemaVersion, ...lane } = document;
	if ('collectionName' in lane) {
		const { collectionName, ...rest } = lane;
		return { collection: collectionName, ...rest };
	}
	return lane;
}

function sameStringArray(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameCoverageRecord(
	left: PersistedCoverageRecord,
	right: PersistedCoverageRecord
): boolean {
	return (
		left.collection === right.collection &&
		left.id === right.id &&
		left.freshUntilMs === right.freshUntilMs &&
		left.updatedAtMs === right.updatedAtMs &&
		sameStringArray(left.coveredQueryKeys, right.coveredQueryKeys)
	);
}

function sameRangedResume(
	left: RangedLaneResumeState | null,
	right: RangedLaneResumeState | null
): boolean {
	if (left === null || right === null) return left === right;
	return (
		left.beforeSeconds === right.beforeSeconds &&
		left.excludeWooIds.length === right.excludeWooIds.length &&
		left.excludeWooIds.every((wooId, index) => wooId === right.excludeWooIds[index])
	);
}

function sameCoverageLane(left: PersistedCoverageLane, right: PersistedCoverageLane): boolean {
	return (
		left.collection === right.collection &&
		left.queryKey === right.queryKey &&
		left.complete === right.complete &&
		left.freshUntilMs === right.freshUntilMs &&
		left.updatedAtMs === right.updatedAtMs &&
		sameStringArray(left.expectedRecordIds, right.expectedRecordIds)
	);
}

function retentionDecisionKey(
	documentType: PersistedCoverageRetentionDecision['documentType'],
	collection: string,
	key: string
): string {
	return `${documentType}::${collection}::${key}`;
}

function isRxConflict(error: unknown): boolean {
	return Boolean(
		error && typeof error === 'object' && 'code' in error && error.code === 'CONFLICT'
	);
}

function localRecordCoverage(record: PersistedCoverageRecord, nowMs: number): LocalRecordCoverage {
	return {
		collection: record.collection,
		id: record.id,
		fresh: record.freshUntilMs > nowMs,
	};
}

function localLaneCoverage(
	lane: PersistedCoverageLane,
	nowMs: number
): LocalLaneCoverageWithExpectedRecords {
	return {
		collection: lane.collection,
		queryKey: lane.queryKey,
		complete: lane.complete,
		fresh: lane.freshUntilMs > nowMs,
		expectedRecordIds: [...lane.expectedRecordIds],
		...(lane.rangedResume ? { rangedResume: lane.rangedResume } : {}),
	};
}

function mergeRecordWithCurrentRevision(
	current: CoverageRecordDocument,
	next: PersistedCoverageRecord
): CoverageRecordDocument {
	const merged = mergePersistedCoverageWrites([
		{ records: [fromRecordDocument(current)], lanes: [] },
		{ records: [next], lanes: [] },
	]).documents.records[0];
	return toRecordDocument(merged);
}

/** The cursor a ranged pass STARTED from; the write may only advance from exactly this. */
export type RangedAncestryGuard = {
	expected: RangedLaneResumeState | null;
};

/**
 * Demote a ranged lane write whose cursor lineage no longer matches the stored document.
 *
 * A broken lineage means the lane was removed or moved while the pass was in flight, so the
 * ids this pass carries are not the whole story: the cursor is dropped and the lane is forced
 * incomplete, which restarts the walk from the top of the range on the next pass. Wasteful,
 * always safe — the alternative is a report that silently omits orders.
 */
function laneForAncestry(
	current: PersistedCoverageLane | null,
	next: PersistedCoverageLane,
	ancestry?: RangedAncestryGuard
): PersistedCoverageLane {
	if (!ancestry) return next;
	if (sameRangedResume(current?.rangedResume ?? null, ancestry.expected)) return next;
	const { rangedResume: _rejected, ...demoted } = next;
	return { ...demoted, complete: false };
}

function mergeLaneWithCurrentRevision(
	current: CoverageLaneDocument,
	next: PersistedCoverageLane
): CoverageLaneDocument {
	const merged = mergePersistedCoverageWrites([
		{ records: [], lanes: [fromLaneDocument(current)] },
		{ records: [], lanes: [next] },
	]).documents.lanes[0];
	return toLaneDocument(merged);
}

/** Structural: any database carrying the coverage collections (LabDatabase and engine scope dbs both satisfy it). */
export type CoverageDatabase = {
	coverageRecords: RxCoverageCollection<CoverageRecordDocument>;
	coverageLanes: RxCoverageCollection<CoverageLaneDocument>;
};

export class RxCoverageRepository {
	private readonly coverageRecords: RxCoverageCollection<CoverageRecordDocument>;
	private readonly coverageLanes: RxCoverageCollection<CoverageLaneDocument>;

	constructor(db: CoverageDatabase) {
		this.coverageRecords = db.coverageRecords;
		this.coverageLanes = db.coverageLanes;
	}

	async upsertCoverageDocuments(documents: PersistedCoverageDocumentSet): Promise<void> {
		if (documents.records.length > 0) {
			assertBulkSuccess(
				await this.coverageRecords.bulkUpsert(documents.records.map(toRecordDocument)),
				'persistence upsert'
			);
		}
		if (documents.lanes.length > 0) {
			assertBulkSuccess(
				await this.coverageLanes.bulkUpsert(documents.lanes.map(toLaneDocument)),
				'persistence upsert'
			);
		}
	}

	async recordRecords(input: RecordCoverageRecordsInput): Promise<void> {
		const freshUntilMs = input.nowMs + input.freshForMs;
		await this.writeCoverageDocumentsWithMerge({
			records: input.records.map((record) => ({
				collection: input.collection,
				id: record.id,
				coveredQueryKeys: [input.queryKey],
				freshUntilMs,
				updatedAtMs: input.nowMs,
			})),
			lanes: [],
		});
	}

	/**
	 * Publish a ranged walk's cursor + progress mid-pass, without touching the id set (#954).
	 *
	 * Two problems solve themselves here. The Reports progress line reads this document, and the
	 * id set is only written when a pass ENDS — so without a per-page publish the line stayed
	 * dark for the whole first pass, which is the entire walk for any range under the per-pass
	 * bound, while the charts and totals were already moving. And an incomplete lane is subject
	 * to coverage compaction: a long pass could outlive the freshness plus stale-retention
	 * windows, have its lane removed, and then be rejected by the ancestry guard — restarting
	 * forever instead of converging. Refreshing `freshUntilMs` every page closes both.
	 *
	 * `complete` and `expectedRecordIds` are deliberately left alone, so this can never downgrade
	 * a lane; it only ever moves the cursor forward under the same ancestry rule as a full write.
	 */
	async publishRangedResume(input: {
		collection: string;
		queryKey: string;
		resume: RangedLaneResumeState;
		expected: RangedLaneResumeState | null;
		nowMs: number;
		freshForMs: number;
	}): Promise<void> {
		const documentId = coverageLaneKey(input.collection, input.queryKey);
		const freshUntilMs = input.nowMs + input.freshForMs;
		const document = await this.coverageLanes.findOne(documentId).exec();
		if (!document) {
			// Only the START of a walk may create the lane. A pass that expected a cursor and
			// found no lane at all has lost its lineage; the end-of-pass write demotes it.
			if (input.expected !== null) return;
			try {
				await this.coverageLanes.insert(
					toLaneDocument({
						collection: input.collection,
						queryKey: input.queryKey,
						complete: false,
						expectedRecordIds: [],
						freshUntilMs,
						updatedAtMs: input.nowMs,
						rangedResume: input.resume,
					})
				);
			} catch (error) {
				if (!isRxConflict(error)) throw error;
			}
			return;
		}
		await document.incrementalModify((currentDocument) => {
			const current = fromLaneDocument(currentDocument);
			if (!sameRangedResume(current.rangedResume ?? null, input.expected)) return currentDocument;
			return toLaneDocument({
				...current,
				freshUntilMs: Math.max(current.freshUntilMs, freshUntilMs),
				updatedAtMs: input.nowMs,
				rangedResume: input.resume,
			});
		});
	}

	async recordCumulativeQueryResult(
		input: BuildCumulativeCoverageDocumentsFromQueryResultInput
	): Promise<void> {
		const freshUntilMs = input.nowMs + input.freshForMs;
		const existingLane = input.resetCumulativeExpectedIds
			? null
			: await this.readCoverageLane(input.collection, input.queryKey);
		// Dedupe through a Set: a ranged report accumulates tens of thousands of unique ids across
		// passes, and an `indexOf` scan per element is quadratic — ~50M string compares at 10,000
		// ids and ~450M at 30,000, run synchronously before persistence on exactly the large ranges
		// this path exists for.
		const expectedRecordIds = [
			...new Set([
				...(existingLane?.expectedRecordIds ?? []),
				...input.records.map((record) => record.id),
			]),
		];

		const recordIdsToRefresh = input.complete
			? expectedRecordIds
			: input.records.map((record) => record.id);

		// `undefined` leaves the lane's existing cursor alone (the greedy custom-pull lane never
		// sets one); an explicit `null` CLEARS it — the ranged walk reached the end of its range.
		const rangedResume =
			input.rangedResume === undefined
				? existingLane?.rangedResume
				: (input.rangedResume ?? undefined);
		const { rangedResume: _previousResume, ...baseLane }: PersistedCoverageLane =
			!input.complete && existingLane?.complete
				? { ...existingLane, expectedRecordIds, updatedAtMs: input.nowMs }
				: {
						collection: input.collection,
						queryKey: input.queryKey,
						complete: input.complete,
						expectedRecordIds,
						freshUntilMs,
						updatedAtMs: input.nowMs,
					};
		const lane = rangedResume ? { ...baseLane, rangedResume } : baseLane;

		for (const record of recordIdsToRefresh.map((id) => ({
			collection: input.collection,
			id,
			coveredQueryKeys: [input.queryKey],
			freshUntilMs,
			updatedAtMs: input.nowMs,
		}))) {
			await this.insertOrMergeRecord(record);
		}
		await this.insertOrMergeLane(
			lane,
			// Only a ranged walk carries an ancestry expectation; the greedy custom-pull lane
			// passes no cursor and is written exactly as before.
			input.rangedResume === undefined
				? undefined
				: { expected: input.rangedResumeExpected ?? null }
		);
	}

	async recordQueryResult(input: BuildCoverageDocumentsFromQueryResultInput): Promise<void> {
		const nextDocuments = buildCoverageDocumentsFromQueryResult(input);
		await this.writeCoverageDocumentsWithMerge(nextDocuments);
	}

	async readCoverageDocuments(): Promise<PersistedCoverageDocumentSet> {
		const [records, lanes] = await Promise.all([
			this.coverageRecords
				.find({ selector: {}, sort: [{ collectionName: 'asc' }, { id: 'asc' }] })
				.exec(),
			this.coverageLanes
				.find({ selector: {}, sort: [{ collectionName: 'asc' }, { queryKey: 'asc' }] })
				.exec(),
		]);

		return {
			records: records.map((document) => fromRecordDocument(toJson(document))),
			lanes: lanes.map((document) => fromLaneDocument(toJson(document))),
		};
	}

	async readLocalCoverageState(nowMs: number): Promise<LocalCoverageState> {
		return toLocalCoverageState({ documents: await this.readCoverageDocuments(), nowMs });
	}

	async readLocalRecordCoverage(
		collection: string,
		id: string,
		nowMs: number
	): Promise<LocalRecordCoverage | null> {
		const document = await this.coverageRecords.findOne(coverageRecordKey(collection, id)).exec();
		return document ? localRecordCoverage(fromRecordDocument(toJson(document)), nowMs) : null;
	}

	async readLocalRecordCoverages(
		collection: string,
		ids: string[],
		nowMs: number
	): Promise<LocalRecordCoverage[]> {
		const records = await Promise.all(
			ids.map((id) => this.readLocalRecordCoverage(collection, id, nowMs))
		);
		return records.filter((record): record is LocalRecordCoverage => record !== null);
	}

	async readLocalLaneCoverage(
		collection: string,
		queryKey: string,
		nowMs: number
	): Promise<LocalLaneCoverageWithExpectedRecords | null> {
		const lane = await this.readCoverageLane(collection, queryKey);
		return lane ? localLaneCoverage(lane, nowMs) : null;
	}

	private async readCoverageLane(
		collection: string,
		queryKey: string
	): Promise<PersistedCoverageLane | null> {
		const document = await this.coverageLanes.findOne(coverageLaneKey(collection, queryKey)).exec();
		return document ? fromLaneDocument(toJson(document)) : null;
	}

	async expectedRecordIdsForLane(
		collection: string,
		queryKey: string,
		nowMs: number
	): Promise<string[]> {
		return expectedRecordIdsForLane({
			documents: await this.readCoverageDocuments(),
			collection,
			queryKey,
			nowMs,
		});
	}

	async compactRetention(
		input: Omit<PlanPersistedCoverageRetentionInput, 'documents'>
	): Promise<PersistedCoverageCompactionResult> {
		const existingDocuments = await this.readCoverageDocuments();
		const plannedResult = compactPersistedCoverageDocuments({
			...input,
			documents: existingDocuments,
		});
		const removalsByKey = new Map(
			plannedResult.removed.map((decision) => [
				retentionDecisionKey(decision.documentType, decision.collection, decision.key),
				decision,
			])
		);
		const appliedRemovals: PersistedCoverageRetentionDecision[] = [];

		for (const record of existingDocuments.records) {
			const removalDecision = removalsByKey.get(
				retentionDecisionKey('record', record.collection, record.id)
			);
			if (removalDecision && (await this.removeRecordIfUnchanged(record))) {
				appliedRemovals.push(removalDecision);
			}
		}

		for (const lane of existingDocuments.lanes) {
			const removalDecision = removalsByKey.get(
				retentionDecisionKey('lane', lane.collection, lane.queryKey)
			);
			if (removalDecision && (await this.removeLaneIfUnchanged(lane))) {
				appliedRemovals.push(removalDecision);
			}
		}

		return {
			decisions: plannedResult.decisions,
			documents: await this.readCoverageDocuments(),
			removed: appliedRemovals,
		};
	}

	private async writeCoverageDocumentsWithMerge(
		documents: PersistedCoverageDocumentSet
	): Promise<void> {
		for (const record of documents.records) {
			await this.insertOrMergeRecord(record);
		}

		for (const lane of documents.lanes) {
			await this.insertOrMergeLane(lane);
		}
	}

	private async insertOrMergeRecord(record: PersistedCoverageRecord): Promise<void> {
		const documentId = coverageRecordKey(record.collection, record.id);
		const document = await this.coverageRecords.findOne(documentId).exec();
		if (document) {
			await this.mergeExistingRecord(document, record);
			return;
		}

		try {
			await this.coverageRecords.insert(toRecordDocument(record));
		} catch (error) {
			if (!isRxConflict(error)) throw error;
			const conflictingDocument = await this.coverageRecords.findOne(documentId).exec(true);
			await this.mergeExistingRecord(conflictingDocument, record);
		}
	}

	private async mergeExistingRecord(
		document: RxCoverageDocument<CoverageRecordDocument>,
		record: PersistedCoverageRecord
	): Promise<void> {
		await document.incrementalModify((currentDocument) =>
			mergeRecordWithCurrentRevision(currentDocument, record)
		);
	}

	private async insertOrMergeLane(
		lane: PersistedCoverageLane,
		ancestry?: RangedAncestryGuard
	): Promise<void> {
		const documentId = coverageLaneKey(lane.collection, lane.queryKey);
		const document = await this.coverageLanes.findOne(documentId).exec();
		if (document) {
			await this.mergeExistingLane(document, lane, ancestry);
			return;
		}

		try {
			await this.coverageLanes.insert(toLaneDocument(laneForAncestry(null, lane, ancestry)));
		} catch (error) {
			if (!isRxConflict(error)) throw error;
			const conflictingDocument = await this.coverageLanes.findOne(documentId).exec(true);
			await this.mergeExistingLane(conflictingDocument, lane, ancestry);
		}
	}

	private async mergeExistingLane(
		document: RxCoverageDocument<CoverageLaneDocument>,
		lane: PersistedCoverageLane,
		ancestry?: RangedAncestryGuard
	): Promise<void> {
		// The ancestry test runs INSIDE incrementalModify, against the document as it stands at
		// write time. Checking it before the write would leave a wide window — the pass's coverage
		// records are persisted first — in which a reset, a compaction or a competing writer could
		// drop or move the lane, and the advanced cursor would then be resurrected onto a lineage
		// it never walked. RxDB re-runs this function on conflict, so the comparison is a CAS.
		await document.incrementalModify((currentDocument) =>
			mergeLaneWithCurrentRevision(
				currentDocument,
				laneForAncestry(fromLaneDocument(currentDocument), lane, ancestry)
			)
		);
	}

	private async removeRecordIfUnchanged(record: PersistedCoverageRecord): Promise<boolean> {
		const document = await this.coverageRecords
			.findOne(coverageRecordKey(record.collection, record.id))
			.exec();
		if (!document) return false;

		let removed = false;
		await document.incrementalModify((currentDocument) => {
			const currentRecord = fromRecordDocument(currentDocument);
			removed = sameCoverageRecord(currentRecord, record);
			return removed ? { ...currentDocument, _deleted: true } : currentDocument;
		});
		return removed;
	}

	private async removeLaneIfUnchanged(lane: PersistedCoverageLane): Promise<boolean> {
		const document = await this.coverageLanes
			.findOne(coverageLaneKey(lane.collection, lane.queryKey))
			.exec();
		if (!document) return false;

		let removed = false;
		await document.incrementalModify((currentDocument) => {
			const currentLane = fromLaneDocument(currentDocument);
			removed = sameCoverageLane(currentLane, lane);
			return removed ? { ...currentDocument, _deleted: true } : currentDocument;
		});
		return removed;
	}
}
