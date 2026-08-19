import { assertBulkSuccess } from '@wcpos/sync-core';

import {
	buildCoverageDocumentsFromQueryResult,
	type BuildCoverageDocumentsFromQueryResultInput,
	type BuildCumulativeCoverageDocumentsFromQueryResultInput,
	compactPersistedCoverageDocuments,
	expectedRecordIdsForLane,
	laneHoldsBrowseWindowPrefix,
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
import { retainedCoverageQueryKeys } from './coverage-key-retention';

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
	next: PersistedCoverageRecord,
	liveLaneKeys: ReadonlySet<string>
): CoverageRecordDocument {
	const merged = mergePersistedCoverageWrites([
		{ records: [fromRecordDocument(current)], lanes: [] },
		{ records: [next], lanes: [] },
	]).documents.records[0];
	// The union is still how two writers combine; the prune is what stops it growing without
	// bound (#1034). Applied AFTER the merge so a key this write is asserting survives even
	// when the stored document predates its lane.
	return toRecordDocument({
		...merged,
		coveredQueryKeys: retainedCoverageQueryKeys(merged.coveredQueryKeys, liveLaneKeys),
	});
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

/** Structural: any database carrying the coverage collections — any engine scope database satisfies it. */
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

		// The cumulative path writes records directly rather than through
		// writeCoverageDocumentsWithMerge, so it resolves the live-lane set itself (#1034).
		// Its OWN key is a ranged lane, which is never prunable — but the records it touches
		// can still be carrying browse-window keys whose lanes are long gone.
		const records = recordIdsToRefresh.map((id) => ({
			collection: input.collection,
			id,
			coveredQueryKeys: [input.queryKey],
			freshUntilMs,
			updatedAtMs: input.nowMs,
		}));
		const liveLaneKeys =
			records.length > 0
				? await this.liveLaneKeysFor({ records, lanes: [lane] })
				: new Set<string>();
		for (const record of records) {
			await this.insertOrMergeRecord(record, liveLaneKeys);
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
		// PREFIX ANCESTRY, re-evaluated HERE rather than only ahead of the walk (#1030
		// residual). The fetcher's `browseWindowPrefixSurvived` check and this write are two
		// separate operations, and `withLedgerRecovery` re-invokes this method with the SAME
		// arguments after a corruption refusal drops `coverageLanes` — replaying a prefix the
		// pre-read already approved onto a store that no longer holds it. Asserting it then
		// would resurrect a lane claiming coverage the rebuild deleted, and since a browse
		// lane's `expectedRecordIds.length` IS the grid's footer total, the grid would report
		// and believe rows it does not have. Because the read now lives inside the replayed
		// call, the replay re-runs it and demotes to the delta instead.
		// Note the guard rather than an unconditional await: a write with no carried prefix must
		// not gain a microtask tick here, or it would reorder against concurrent coverage writes.
		const nextDocuments = input.prefixAncestry
			? await this.documentsWithPrefixAncestry(input)
			: buildCoverageDocumentsFromQueryResult(input);
		await this.writeCoverageDocumentsWithMerge(nextDocuments);
	}

	private async documentsWithPrefixAncestry(
		input: BuildCoverageDocumentsFromQueryResultInput
	): Promise<PersistedCoverageDocumentSet> {
		const ancestry = input.prefixAncestry;
		if (!ancestry) return buildCoverageDocumentsFromQueryResult(input);
		const source = await this.readCoverageLane(input.collection, ancestry.sourceQueryKey);
		if (laneHoldsBrowseWindowPrefix(source?.expectedRecordIds, ancestry.recordIds)) {
			return buildCoverageDocumentsFromQueryResult(input);
		}
		const demoted = buildCoverageDocumentsFromQueryResult({
			...input,
			records: ancestry.fallbackRecordIds.map((id) => ({ id })),
			complete: false,
		});
		// The lane claims NOTHING. Those rows are a TAIL of the listing — the pass resumed at an
		// offset — and `readBrowseWindowContinuation` reads a page-aligned incomplete lane as the
		// listing's LEADING prefix, so storing them would have the next pass offset past rows
		// nobody fetched and splice the window permanently. An empty lane is what actually forces
		// the restart this demotion exists for. Their RECORD coverage survives: the rows are real
		// and already resident, it is only the window claim that is withdrawn.
		return {
			records: demoted.records,
			lanes: demoted.lanes.map((lane) => ({ ...lane, expectedRecordIds: [] })),
		};
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

	/**
	 * Every lane of ONE collection. Deliberately not `readCoverageDocuments()`, which also
	 * reads every coverage RECORD — thousands of rows — where the browse-window eviction
	 * sweep needs only the handful of lanes for one collection. Served by the
	 * `['collectionName','queryKey']` index.
	 */
	async listCoverageLanesForCollection(collection: string): Promise<PersistedCoverageLane[]> {
		// The sort mirrors `readCoverageDocuments` exactly — `['collectionName','queryKey']` is
		// the declared index, and RxDB's dev-mode rejects a sort it cannot serve from one.
		const documents = await this.coverageLanes
			.find({
				selector: { collectionName: collection },
				sort: [{ collectionName: 'asc' }, { queryKey: 'asc' }],
			})
			.exec();
		return documents.map((document) => fromLaneDocument(toJson(document)));
	}

	/**
	 * COMPARE-AND-DELETE a lane whose coverage a larger lane has absorbed (browse-window
	 * eviction, #948/#957 follow-up).
	 *
	 * BOTH conditions run INSIDE `incrementalModify`, against the current revision — not
	 * against the snapshot the caller planned from. That is what makes eviction safe against
	 * a walk that writes this lane between the plan and the delete:
	 *
	 *  - a lane that grew into something `containedIn` no longer covers is left alone, so the
	 *    sweep can never delete coverage the superseding lane does not hold; and
	 *  - a lane REWRITTEN since `supersededAtMs` is left alone. Eviction is a claim about
	 *    stale knowledge — "a deeper window already knows everything this one did" — and a
	 *    rewrite is not stale. Without this the re-written lane is indistinguishable from the
	 *    one that was planned for deletion (same window, same ids), so a walk that finished
	 *    just after the sweep planned would have its lane deleted out from under it and the
	 *    grid's footer would drop to the local count for no reason.
	 *
	 * The comparison is `<=`, and the equality case is the MAIN PATH, not an oversight: a
	 * drain fixes its clock for the tick, so two windows of the same view completed in one
	 * drain carry the same `updatedAtMs`. Requiring strictly-older would make eviction skip
	 * the ordinary scroll and reclaim nothing.
	 *
	 * That leaves one residual, named rather than hidden (review finding, 2026-08-06, P2): a
	 * victim rewritten LOGICALLY after the survivor but stamped with the same millisecond is
	 * still deleted. Cost is one re-walk of that window — the failure direction this design
	 * picks everywhere — and it does not repeat, because the rewritten lane is no longer the
	 * deepest settled window of its view on the next pass. Closing it properly needs the
	 * stored `_rev`, not a content compare: a same-window rewrite produces identical ids, so
	 * comparing the planned snapshot (what `removeLaneIfUnchanged` does) accepts it exactly
	 * as the timestamp does. Revision-based compare-and-delete would want to cover BOTH
	 * removal call sites and is deliberately left as its own change.
	 *
	 * Returns whether it deleted.
	 */
	async removeCoverageLaneIfContained(input: {
		collection: string;
		queryKey: string;
		containedIn: readonly string[];
		supersededAtMs: number;
	}): Promise<boolean> {
		const document = await this.coverageLanes
			.findOne(coverageLaneKey(input.collection, input.queryKey))
			.exec();
		if (!document) return false;

		const containedIn = new Set(input.containedIn);
		let removed = false;
		await document.incrementalModify((currentDocument) => {
			const currentLane = fromLaneDocument(currentDocument);
			removed =
				currentLane.updatedAtMs <= input.supersededAtMs &&
				currentLane.expectedRecordIds.every((id) => containedIn.has(id));
			return removed ? { ...currentDocument, _deleted: true } : currentDocument;
		});
		return removed;
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
		// ONE lane-key read per write BATCH, not per record (#1034). Every record in this
		// batch is merged against the same live-lane set, so a browse window whose lane
		// #1032 evicted stops being carried on the records it used to cover. Skipped
		// entirely when the batch writes no records.
		const liveLaneKeys =
			documents.records.length > 0 ? await this.liveLaneKeysFor(documents) : new Set<string>();

		for (const record of documents.records) {
			await this.insertOrMergeRecord(record, liveLaneKeys);
		}

		for (const lane of documents.lanes) {
			await this.insertOrMergeLane(lane);
		}
	}

	/**
	 * The lane keys a record written in this batch may still claim: those with a stored lane,
	 * plus the lanes this very batch is about to write.
	 *
	 * The second half is load-bearing. Records are written BEFORE lanes above, so a growing
	 * window's own lane does not exist yet at the moment its records are stamped — without it
	 * the prune would strip the key the write is currently asserting, on every single tick.
	 */
	private async liveLaneKeysFor(documents: PersistedCoverageDocumentSet): Promise<Set<string>> {
		const collections = new Set(documents.records.map((record) => record.collection));
		const live = new Set(documents.lanes.map((lane) => lane.queryKey));
		for (const collection of collections) {
			for (const lane of await this.listCoverageLanesForCollection(collection)) {
				live.add(lane.queryKey);
			}
		}
		return live;
	}

	private async insertOrMergeRecord(
		record: PersistedCoverageRecord,
		liveLaneKeys: ReadonlySet<string>
	): Promise<void> {
		const documentId = coverageRecordKey(record.collection, record.id);
		const document = await this.coverageRecords.findOne(documentId).exec();
		if (document) {
			await this.mergeExistingRecord(document, record, liveLaneKeys);
			return;
		}

		try {
			await this.coverageRecords.insert(toRecordDocument(record));
		} catch (error) {
			if (!isRxConflict(error)) throw error;
			const conflictingDocument = await this.coverageRecords.findOne(documentId).exec(true);
			await this.mergeExistingRecord(conflictingDocument, record, liveLaneKeys);
		}
	}

	private async mergeExistingRecord(
		document: RxCoverageDocument<CoverageRecordDocument>,
		record: PersistedCoverageRecord,
		liveLaneKeys: ReadonlySet<string>
	): Promise<void> {
		// The prune runs INSIDE incrementalModify, against the revision actually being
		// written, so a concurrent writer that re-added a key between the read and the write
		// is pruned too rather than leaving a survivor behind.
		await document.incrementalModify((currentDocument) =>
			mergeRecordWithCurrentRevision(currentDocument, record, liveLaneKeys)
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
