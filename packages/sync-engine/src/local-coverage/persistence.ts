import { assertBulkSuccess } from '@wcpos/sync-core';

import { mergePersistedCoverageWrites } from '../scheduler/coverage-write-conflicts';
import {
	buildCoverageDocumentsFromQueryResult,
	type BuildCoverageDocumentsFromQueryResultInput,
	type BuildCumulativeCoverageDocumentsFromQueryResultInput,
	type QueryCoverageResultRecord,
} from '../scheduler/query-coverage-writes';
import {
	compactPersistedCoverageDocuments,
	expectedRecordIdsForLane,
	type PersistedCoverageCompactionResult,
	PersistedCoverageDocumentSet,
	PersistedCoverageLane,
	PersistedCoverageRecord,
	PersistedCoverageRetentionDecision,
	type PlanPersistedCoverageRetentionInput,
	toLocalCoverageState,
} from '../scheduler/persisted-coverage-schema';

import type { LocalCoverageState, LocalRecordCoverage } from '../scheduler/coverage-model';
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
	const { collection, ...rest } = lane;
	return {
		laneKey: coverageLaneKey(collection, lane.queryKey),
		collectionName: collection,
		...rest,
		schemaVersion: 2,
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
		| CoverageLaneDocument
		| (PersistedCoverageLane & { laneKey: string; schemaVersion?: number })
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

	async recordCumulativeQueryResult(
		input: BuildCumulativeCoverageDocumentsFromQueryResultInput
	): Promise<void> {
		const freshUntilMs = input.nowMs + input.freshForMs;
		const existingLane = input.resetCumulativeExpectedIds
			? null
			: await this.readCoverageLane(input.collection, input.queryKey);
		const expectedRecordIds = [
			...(existingLane?.expectedRecordIds ?? []),
			...input.records.map((record) => record.id),
		].filter((id, index, ids) => ids.indexOf(id) === index);

		const recordIdsToRefresh = input.complete
			? expectedRecordIds
			: input.records.map((record) => record.id);

		const lanes =
			!input.complete && existingLane?.complete
				? [
						{
							...existingLane,
							expectedRecordIds,
							updatedAtMs: input.nowMs,
						},
					]
				: [
						{
							collection: input.collection,
							queryKey: input.queryKey,
							complete: input.complete,
							expectedRecordIds,
							freshUntilMs,
							updatedAtMs: input.nowMs,
						},
					];

		await this.writeCoverageDocumentsWithMerge({
			records: recordIdsToRefresh.map((id) => ({
				collection: input.collection,
				id,
				coveredQueryKeys: [input.queryKey],
				freshUntilMs,
				updatedAtMs: input.nowMs,
			})),
			lanes,
		});
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

	private async insertOrMergeLane(lane: PersistedCoverageLane): Promise<void> {
		const documentId = coverageLaneKey(lane.collection, lane.queryKey);
		const document = await this.coverageLanes.findOne(documentId).exec();
		if (document) {
			await this.mergeExistingLane(document, lane);
			return;
		}

		try {
			await this.coverageLanes.insert(toLaneDocument(lane));
		} catch (error) {
			if (!isRxConflict(error)) throw error;
			const conflictingDocument = await this.coverageLanes.findOne(documentId).exec(true);
			await this.mergeExistingLane(conflictingDocument, lane);
		}
	}

	private async mergeExistingLane(
		document: RxCoverageDocument<CoverageLaneDocument>,
		lane: PersistedCoverageLane
	): Promise<void> {
		await document.incrementalModify((currentDocument) =>
			mergeLaneWithCurrentRevision(currentDocument, lane)
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
