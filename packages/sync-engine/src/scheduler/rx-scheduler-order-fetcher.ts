import {
	checkpointInstantMs,
	type CustomPullCheckpointStore,
	type CustomPullRepository,
	normalizeCheckpoint,
	type OrderDocument,
	orderDocumentId,
	shouldApplyPulledDocument,
	type SyncCheckpoint,
	syncCustomPullBatchIntoRepository,
	type WooOrderPayload,
} from '@wcpos/sync-core';

import { materializeLocalOnly } from '../materialization/record-materialization';
import {
	parseOrderBrowserSchedulerDescriptor,
	WOO_REST_MAX_PER_PAGE,
} from './order-browser-scheduler-descriptor';
import { assertReturnedRequestedIds, chunk, httpGet } from './rx-scheduler-collection-fetcher';
import { pullRequestLimit } from './replication-policy';

import type { SchedulerFetcher, SchedulerFetcherContext } from './replication-scheduler';
import type {
	BuildCoverageDocumentsFromQueryResultInput,
	BuildCumulativeCoverageDocumentsFromQueryResultInput,
} from './query-coverage-writes';
import type { FetchTask, FetchTaskResult } from './replication-policy';

type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

const SUPPORTED_ORDER_QUERY_KEY = 'orders:custom-pull';
const MAX_STALLED_BATCHES = 3;
const DEFAULT_COVERAGE_FRESH_FOR_MS = 5 * 60 * 1_000;

export type OrdersSchedulerCoverageRepository = {
	recordQueryResult(input: BuildCoverageDocumentsFromQueryResultInput): Promise<void>;
	recordRecords?(
		input: Omit<BuildCoverageDocumentsFromQueryResultInput, 'complete'>
	): Promise<void>;
	recordCumulativeQueryResult?(
		input: BuildCumulativeCoverageDocumentsFromQueryResultInput
	): Promise<void>;
	readLocalLaneCoverage?(
		collection: string,
		queryKey: string,
		nowMs: number
	): Promise<{ complete: boolean; fresh: boolean } | null>;
};

export type OrdersSchedulerFetcherInput = {
	/** The versioned WCPOS sync base — all order reads (custom-pull, browser, targeted) route through it. */
	baseUrl: string;
	repository: CustomPullRepository;
	checkpointStore: CustomPullCheckpointStore;
	fetcher?: Fetcher;
	coverageRepository?: OrdersSchedulerCoverageRepository;
	coverageFreshForMs?: number;
	nowMs?: () => number;
	pullBatchSize?: () => number | undefined;
	/**
	 * Resolved before each pull batch; pulled documents whose ids are in the
	 * set are skipped so scheduled pulls never overwrite queued local work.
	 */
	pendingMutationOrderIds?: () => Promise<ReadonlySet<string | number>>;
};

function assertSupportedOrderTask(task: FetchTask): void {
	if (task.collection !== 'orders') {
		throw new Error(`Orders scheduler fetcher cannot run ${task.collection} tasks`);
	}

	if (task.queryKey !== SUPPORTED_ORDER_QUERY_KEY) {
		throw new Error('Order scheduler task queryKey is not supported by the custom-pull fetcher');
	}
}

function browserOrderQueryDescriptor(
	task: FetchTask,
	pullBatchSize?: () => number | undefined
): { status: string; search: string; limit: number; perPage: number } | null {
	const decision = parseOrderBrowserSchedulerDescriptor(task.queryKey);
	if (!decision) return null;
	if ('skipReason' in decision) {
		throw new Error(
			decision.skipReason === 'descriptor is not supported'
				? `Order scheduler browser queryKey is not a supported descriptor: ${task.queryKey}`
				: decision.skipReason
		);
	}
	if (!Number.isSafeInteger(task.limit) || task.limit <= 0) {
		throw new Error('Order scheduler browser task limit must be a positive integer');
	}

	const limit = Math.min(task.limit, decision.descriptor.limit);
	return {
		status: decision.descriptor.wooStatus,
		search: decision.descriptor.search,
		limit,
		perPage: Math.min(limit, pullRequestLimit(task, pullBatchSize), WOO_REST_MAX_PER_PAGE),
	};
}

function targetedOrderIds(task: FetchTask): number[] {
	// The numeric server ids travel ONLY on the explicit wooIds channel — independent of
	// the document-key encoding (storage keys are uuids since the P0-1 emit-flip, so the
	// server id is unrecoverable from the key). Every targeted seeder populates it
	// (seedTargetedLane); a targeted task without it is a contract violation, not
	// something to fall back from.
	if (!task.wooIds || task.wooIds.length === 0) {
		throw new Error(`Targeted order scheduler task is missing its wooIds channel: ${task.id}`);
	}
	return task.wooIds;
}

export function orderDocumentFromWooPayload(payload: WooOrderPayload) {
	return materializeLocalOnly(payload).storedDocument;
}

/**
 * Client-assemble a custom-pull record into the stored order document. The server streams the
 * payload + its computed sync (checkpoint/revision/sequence/source); the CLIENT derives the
 * storage id from the payload's server-stamped uuid via identifyRecord — uniform with the
 * browser/targeted paths (orderDocumentFromWooPayload). The server-built envelope id is ignored
 * here, so the client owns identity for every order path. (mintOnMissing:false — a pulled record
 * MUST already carry its uuid.) sync/local stay as the server computed them.
 */
function assembleCustomPullOrderDocument(document: OrderDocument): OrderDocument {
	// Derive BOTH identity fields from the payload (not the server envelope): the storage id from
	// the stamped uuid, and wooOrderId from payload.id — same as orderDocumentFromWooPayload. The
	// scheduler keys coverage + the pending-mutation pull guard off wooOrderId, so trusting a stale
	// envelope wooOrderId could record a correct payload under the wrong order or clobber a queued
	// local mutation. Owning both from the payload keeps the document internally consistent.
	return materializeLocalOnly(document.payload, document).storedDocument;
}

/**
 * The COVERAGE-record id for a pulled order — the stable Woo-id-space key
 * (`woo-order:<wooId>`), NOT the uuid STORAGE key (P0-1). Coverage stays in this space on
 * both sides of the lane gate (RxOrdersBrowser current-ids) and the targeted-records
 * store, which is seeded by wooId before any uuid exists — mirrors products'
 * coverageRecordId. Born-local orders with no wooOrderId fall back to the storage id.
 */
function orderCoverageRecordId(document: { id: string; wooOrderId: number | null }): string {
	return document.wooOrderId === null ? document.id : orderDocumentId(document.wooOrderId);
}

function coverageNowMs(input: OrdersSchedulerFetcherInput): number {
	return input.nowMs?.() ?? Date.now();
}

function orderCoverageInput(
	input: OrdersSchedulerFetcherInput,
	task: FetchTask,
	documentIds: string[],
	complete: boolean
): BuildCoverageDocumentsFromQueryResultInput {
	return {
		collection: 'orders',
		queryKey: task.queryKey,
		records: documentIds.map((id) => ({ id })),
		complete,
		nowMs: coverageNowMs(input),
		freshForMs: input.coverageFreshForMs ?? DEFAULT_COVERAGE_FRESH_FOR_MS,
	};
}

async function recordOrderFetchedRecords(
	input: OrdersSchedulerFetcherInput,
	task: FetchTask,
	documentIds: string[]
): Promise<void> {
	if (!input.coverageRepository?.recordRecords) return;
	const { complete: _complete, ...coverageInput } = orderCoverageInput(
		input,
		task,
		documentIds,
		false
	);
	await input.coverageRepository.recordRecords(coverageInput);
}

function fullBaselineMarkerQueryKey(task: FetchTask): string {
	return `${task.queryKey}:baseline-in-progress:${task.id}`;
}

async function writeFullBaselineMarker(
	input: OrdersSchedulerFetcherInput,
	task: FetchTask
): Promise<void> {
	if (!input.coverageRepository) return;
	await input.coverageRepository.recordQueryResult({
		collection: 'orders',
		queryKey: fullBaselineMarkerQueryKey(task),
		records: [],
		complete: true,
		nowMs: coverageNowMs(input),
		freshForMs: input.coverageFreshForMs ?? DEFAULT_COVERAGE_FRESH_FOR_MS,
	});
}

async function clearFullBaselineMarker(
	input: OrdersSchedulerFetcherInput,
	task: FetchTask
): Promise<void> {
	if (!input.coverageRepository) return;
	await input.coverageRepository.recordQueryResult({
		collection: 'orders',
		queryKey: fullBaselineMarkerQueryKey(task),
		records: [],
		complete: false,
		nowMs: coverageNowMs(input) + 1,
		freshForMs: 0,
	});
}

async function hasFullBaselineMarker(
	input: OrdersSchedulerFetcherInput,
	task: FetchTask
): Promise<boolean> {
	if (!input.coverageRepository?.readLocalLaneCoverage) return false;
	const lane = await input.coverageRepository.readLocalLaneCoverage(
		'orders',
		fullBaselineMarkerQueryKey(task),
		coverageNowMs(input)
	);
	return Boolean(lane?.complete && lane.fresh);
}

async function recordOrderFetchCoverage(
	input: OrdersSchedulerFetcherInput,
	task: FetchTask,
	documentIds: string[],
	complete: boolean
): Promise<void> {
	if (!input.coverageRepository) return;
	await input.coverageRepository.recordQueryResult(
		orderCoverageInput(input, task, documentIds, complete)
	);
}

async function recordCumulativeOrderFetchCoverage(
	input: OrdersSchedulerFetcherInput,
	task: FetchTask,
	documentIds: string[],
	complete: boolean,
	resetCumulativeExpectedIds: boolean
): Promise<void> {
	if (!input.coverageRepository) return;
	const coverageInput = orderCoverageInput(
		input,
		task,
		documentIds,
		complete && Boolean(input.coverageRepository.recordCumulativeQueryResult)
	);
	if (!input.coverageRepository.recordCumulativeQueryResult) {
		await input.coverageRepository.recordQueryResult(coverageInput);
		return;
	}
	await input.coverageRepository.recordCumulativeQueryResult({
		...coverageInput,
		resetCumulativeExpectedIds,
	});
	if (coverageInput.complete) {
		await clearFullBaselineMarker(input, task);
	}
}

function targetedBatchSize(task: FetchTask, pullBatchSize?: () => number | undefined): number {
	if (!Number.isSafeInteger(task.limit) || task.limit <= 0) {
		throw new Error('Targeted order scheduler task limit must be a positive integer');
	}
	return Math.min(pullRequestLimit(task, pullBatchSize), WOO_REST_MAX_PER_PAGE);
}

async function fetchBrowserOrderQuery(
	input: OrdersSchedulerFetcherInput,
	task: FetchTask,
	descriptor: { status: string; search: string; limit: number; perPage: number },
	context?: SchedulerFetcherContext
): Promise<FetchTaskResult> {
	if (task.collection !== 'orders') {
		throw new Error(`Orders scheduler fetcher cannot run ${task.collection} tasks`);
	}

	let documentCount = 0;
	let requestCount = 0;
	const fetchedDocumentIds: string[] = [];
	let exhausted = false;

	while (documentCount < descriptor.limit) {
		const query = new URLSearchParams();
		if (descriptor.status) query.set('status', descriptor.status);
		if (descriptor.search) query.set('search', descriptor.search);
		query.set('per_page', String(descriptor.perPage));
		query.set('page', String(requestCount + 1));
		query.set('orderby', 'id');
		query.set('order', 'desc');

		const url = `${input.baseUrl}/orders?${query.toString()}`;
		const response = await httpGet(input, url, context);
		if (!response.ok) {
			throw new Error(`Woo REST browser order query request failed: ${response.status}`);
		}

		const payloads = JSON.parse(await response.text()) as WooOrderPayload[];
		const remaining = descriptor.limit - documentCount;
		const documents = payloads.slice(0, remaining).map(orderDocumentFromWooPayload);
		// Offline-first: never overwrite an order that has queued local mutations.
		// Re-read the pending set IMMEDIATELY before each page's upsert (not once up
		// front) so a mutation queued mid-pull — during a slow request or a later
		// page — is still honored. Skip the upsert for those (the local dirty copy
		// stays resident) but still count them as covered so the window isn't
		// reported incomplete and endlessly re-pulled.
		const pending = input.pendingMutationOrderIds
			? await input.pendingMutationOrderIds()
			: undefined;
		const applicable = pending
			? documents.filter((document) => shouldApplyPulledDocument(document, pending))
			: documents;
		await input.repository.upsertMany(applicable);
		fetchedDocumentIds.push(...documents.map(orderCoverageRecordId));
		documentCount += documents.length;
		requestCount += 1;

		if (payloads.length < descriptor.perPage && payloads.length <= remaining) {
			exhausted = true;
			break;
		}
	}

	if (descriptor.search === '') {
		await recordOrderFetchCoverage(input, task, fetchedDocumentIds, exhausted);
	} else {
		await recordOrderFetchedRecords(input, task, fetchedDocumentIds);
	}

	return {
		taskId: task.id,
		documentCount,
		requestCount,
		completed: true,
	};
}

async function fetchTargetedOrders(
	input: OrdersSchedulerFetcherInput,
	task: FetchTask,
	context?: SchedulerFetcherContext
): Promise<FetchTaskResult> {
	if (task.collection !== 'orders') {
		throw new Error(`Orders scheduler fetcher cannot run ${task.collection} tasks`);
	}

	const ids = targetedOrderIds(task);
	const batchSize = targetedBatchSize(task, input.pullBatchSize);
	let documentCount = 0;
	let requestCount = 0;
	const fetchedDocumentIds: string[] = [];

	for (const idsBatch of chunk(ids, batchSize)) {
		const query = new URLSearchParams();
		query.set('include', idsBatch.join(','));
		query.set('per_page', String(idsBatch.length));
		query.set('orderby', 'include');

		const url = `${input.baseUrl}/orders?${query.toString()}`;
		const response = await httpGet(input, url, context);
		if (!response.ok) {
			throw new Error(`Woo REST targeted order request failed: ${response.status}`);
		}

		const payloads = JSON.parse(await response.text()) as WooOrderPayload[];
		assertReturnedRequestedIds(
			{ restLabel: 'order', payloadWooId: (payload: WooOrderPayload) => Number(payload.id) },
			idsBatch,
			payloads
		);
		const documents = payloads.map(orderDocumentFromWooPayload);
		// Offline-first: re-read the pending set per batch (not once up front) so a
		// mutation queued mid-pull is honored; skip overwriting orders with queued
		// local mutations (their dirty local copy wins), but keep them in coverage.
		const pending = input.pendingMutationOrderIds
			? await input.pendingMutationOrderIds()
			: undefined;
		const applicable = pending
			? documents.filter((document) => shouldApplyPulledDocument(document, pending))
			: documents;
		await input.repository.upsertMany(applicable);
		fetchedDocumentIds.push(...documents.map(orderCoverageRecordId));
		documentCount += documents.length;
		requestCount += 1;
	}

	await recordOrderFetchCoverage(input, task, fetchedDocumentIds, true);

	return {
		taskId: task.id,
		documentCount,
		requestCount,
		completed: true,
	};
}

function checkpointAdvanced(previous: SyncCheckpoint, next: SyncCheckpoint): boolean {
	// `updatedAtGmt` is compared as an INSTANT (Woo emits one GMT time in bare / `Z`
	// / `+00:00` forms); a raw string compare would count a format flip as progress
	// and defeat the stall guard below (1.9.x bug fa7b51add). See checkpointInstantMs.
	return (
		checkpointInstantMs(next.updatedAtGmt) !== checkpointInstantMs(previous.updatedAtGmt) ||
		next.orderId !== previous.orderId ||
		next.revision !== previous.revision ||
		next.sequence !== previous.sequence
	);
}

function isInitialCheckpoint(checkpoint: SyncCheckpoint): boolean {
	const initialCheckpoint = normalizeCheckpoint(null);
	return (
		checkpoint.updatedAtGmt === initialCheckpoint.updatedAtGmt &&
		checkpoint.orderId === initialCheckpoint.orderId &&
		checkpoint.revision === initialCheckpoint.revision &&
		checkpoint.sequence === initialCheckpoint.sequence
	);
}

export function createOrdersSchedulerFetcher(input: OrdersSchedulerFetcherInput): SchedulerFetcher {
	let stalledBatches = 0;
	const fullBaselineGreedyTasks = new Set<string>();
	// This WEB host's explicit transport default — sync-core requires the fetcher port
	// (no silent global fallback in the engine); the host is where the choice belongs.
	const fetcher: Fetcher = input.fetcher ?? ((url, init) => window.fetch(url, init));

	return async (task: FetchTask, context?: SchedulerFetcherContext): Promise<FetchTaskResult> => {
		if (task.ids && task.ids.length > 0) {
			return fetchTargetedOrders(input, task, context);
		}

		const browserDescriptor = browserOrderQueryDescriptor(task, input.pullBatchSize);
		if (browserDescriptor) {
			return fetchBrowserOrderQuery(input, task, browserDescriptor, context);
		}

		assertSupportedOrderTask(task);
		const previousCheckpoint = await input.checkpointStore.readCustomPullCheckpoint();
		const greedyTaskStartedAtBaseline =
			task.mode === 'greedy' && isInitialCheckpoint(previousCheckpoint);
		if (greedyTaskStartedAtBaseline) {
			fullBaselineGreedyTasks.add(task.id);
			await writeFullBaselineMarker(input, task);
		}
		const canCompleteAllOrdersLane =
			task.mode === 'greedy' &&
			(fullBaselineGreedyTasks.has(task.id) || (await hasFullBaselineMarker(input, task)));
		const result = await syncCustomPullBatchIntoRepository({
			baseUrl: input.baseUrl,
			limit: pullRequestLimit(task, input.pullBatchSize),
			repository: input.repository,
			checkpoint: previousCheckpoint,
			checkpointStore: input.checkpointStore,
			fetcher,
			signal: context?.signal,
			assembleDocument: assembleCustomPullOrderDocument,
			// F6: opt into the server delete channel so a deleted order removes its local copy
			// (repository.removeDeletedOrders resolves wooOrderId→uuid + guards pending/dirty).
			includeDeletes: true,
			...(input.pendingMutationOrderIds
				? {
						pendingMutationOrderIds: await input.pendingMutationOrderIds(),
						// Re-read the pending set right before applying deletes — a mutation queued mid-pull
						// must protect its order from removal (the destructive path can't use a stale snapshot).
						refreshPendingMutationOrderIds: input.pendingMutationOrderIds,
					}
				: {}),
			afterUpsert: (documents, result) =>
				recordCumulativeOrderFetchCoverage(
					input,
					task,
					documents.map(orderCoverageRecordId),
					canCompleteAllOrdersLane && !result.hasMore,
					greedyTaskStartedAtBaseline
				),
		});
		if (!result.hasMore) {
			fullBaselineGreedyTasks.delete(task.id);
		}
		stalledBatches =
			result.hasMore && !checkpointAdvanced(previousCheckpoint, result.checkpoint)
				? stalledBatches + 1
				: 0;
		if (result.hasMore && stalledBatches >= MAX_STALLED_BATCHES) {
			throw new Error('Custom pull stalled: checkpoint did not advance while hasMore=true');
		}

		return {
			taskId: task.id,
			documentCount: result.documents,
			requestCount: 1,
			completed: !result.hasMore,
		};
	};
}
