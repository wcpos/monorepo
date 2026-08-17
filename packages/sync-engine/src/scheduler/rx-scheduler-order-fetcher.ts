import {
	checkpointInstantMs,
	type CustomPullCheckpointStore,
	type CustomPullRepository,
	normalizeCheckpoint,
	type OrderDocument,
	orderDocumentId,
	type SyncCheckpoint,
	syncCustomPullBatchIntoRepository,
	type SyncObserver,
	wooIdOf,
	type WooOrderPayload,
} from '@wcpos/sync-core';

import { materializeLocalOnly } from '../materialization/record-materialization';
import {
	BROWSE_WINDOW_MAX_PAGES_PER_DRAIN,
	type BrowseWindowContinuation,
	NO_BROWSE_WINDOW_CONTINUATION,
	readBrowseWindowContinuation,
} from './browse-window-continuation';
import { finalizeBrowseWindowLane } from './browse-window-fetcher-tail';
import {
	type BrowseWindowLaneEvictionRepository,
	orderBrowseWindowLaneIdentity,
} from './browse-window-lane-eviction';
import {
	ORDER_BROWSE_RANGED_COMPLETE_MAX_RECORDS,
	orderBrowserPredecessorWindow,
	parseOrderBrowserSchedulerDescriptor,
	WOO_REST_MAX_PER_PAGE,
} from './order-browser-scheduler-descriptor';
import { assertReturnedRequestedIds, chunk, httpGet } from './rx-scheduler-collection-fetcher';
// prettier-ignore
import { type FetchTask, type FetchTaskResult, pullRequestLimit, type SchedulerFetcher, type SchedulerFetcherContext } from './replication-policy';

import type { RangedLaneResumeState } from './persisted-coverage-schema';
import type {
	BuildCoverageDocumentsFromQueryResultInput,
	BuildCumulativeCoverageDocumentsFromQueryResultInput,
} from './query-coverage-writes';

type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

const SUPPORTED_ORDER_QUERY_KEY = 'orders:custom-pull';
const MAX_STALLED_BATCHES = 3;
const DEFAULT_COVERAGE_FRESH_FOR_MS = 5 * 60 * 1_000;
/**
 * The per-PASS record budget for a ranged fetch-to-completion walk — a work bound, not a wall
 * (#954). #941 introduced this number as a runaway backstop; because paging was local to the
 * call and the sort was always `id desc`, tripping it meant every later attempt re-downloaded
 * the SAME newest 10,000 records, so a range with more orders than this could never converge.
 * It now bounds how much ONE drain pass will do: the lane stays honestly incomplete, a
 * continuation cursor is persisted on it, and the next pass picks up where this one stopped.
 *
 * Defined once in the descriptor module (#957) so the parser's `limit=all` descriptor and this
 * walk cannot drift apart.
 */
const RANGED_COMPLETE_MAX_RECORDS = ORDER_BROWSE_RANGED_COMPLETE_MAX_RECORDS;
/**
 * How many boundary-second ids the resume cursor will carry in `exclude`. WP's date columns
 * have one-second resolution, so a page can split a group of orders sharing one creation
 * second; the cursor re-requests that second and excludes the ids already taken. The cap keeps
 * the request URL well inside the ~8KB server default. A tie group larger than this cannot be
 * resumed without either skipping records or looping, so the walk fails loudly instead — see
 * the throw in fetchBrowserOrderQuery.
 */
const RANGED_RESUME_MAX_EXCLUDED_IDS = 500;

export type OrdersSchedulerCoverageRepository = BrowseWindowLaneEvictionRepository & {
	recordQueryResult(input: BuildCoverageDocumentsFromQueryResultInput): Promise<void>;
	recordRecords?(
		input: Omit<BuildCoverageDocumentsFromQueryResultInput, 'complete'>
	): Promise<void>;
	recordCumulativeQueryResult?(
		input: BuildCumulativeCoverageDocumentsFromQueryResultInput
	): Promise<void>;
	publishRangedResume?(input: {
		collection: string;
		queryKey: string;
		resume: RangedLaneResumeState;
		expected: RangedLaneResumeState | null;
		nowMs: number;
		freshForMs: number;
	}): Promise<void>;
	/**
	 * Serves two readers: #954's ranged resume cursor, and #957's browse-window
	 * CONTINUATION, which asks how much of a growing window is already covered so extending
	 * 200 → 300 fetches one page rather than three. Structurally a
	 * BrowseWindowLaneReader; `rangedResume` is simply ignored by that consumer.
	 */
	readLocalLaneCoverage?(
		collection: string,
		queryKey: string,
		nowMs: number
	): Promise<{
		complete: boolean;
		fresh: boolean;
		expectedRecordIds?: string[];
		rangedResume?: RangedLaneResumeState;
	} | null>;
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
	diagnostics?: SyncObserver;
	/**
	 * Resolved before each pull batch; pulled documents whose ids are in the
	 * set are skipped so scheduled pulls never overwrite queued local work.
	 */
	pendingMutationOrderIds?: () => Promise<ReadonlySet<string | number>>;
	/**
	 * The ONE browse-window lane key an explicitly user-driven sync is refreshing. Only
	 * THAT window re-walks from page 1 instead of resuming from its covered prefix; every
	 * other queued window keeps its continuation.
	 */
	refreshBrowseWindowKey?: string;
};

function assertSupportedOrderTask(task: FetchTask): void {
	if (task.collection !== 'orders') {
		throw new Error(`Orders scheduler fetcher cannot run ${task.collection} tasks`);
	}

	if (task.queryKey !== SUPPORTED_ORDER_QUERY_KEY) {
		throw new Error('Order scheduler task queryKey is not supported by the custom-pull fetcher');
	}
}

function browserOrderQueryDescriptor(task: FetchTask, pullBatchSize?: () => number | undefined) {
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

	const limit = decision.descriptor.complete
		? undefined
		: Math.min(task.limit, decision.descriptor.limit);
	return {
		status: decision.descriptor.wooStatus,
		search: decision.descriptor.search,
		customerId: decision.descriptor.customerId,
		cashierId: decision.descriptor.cashierId,
		store: decision.descriptor.store,
		...(limit !== undefined ? { limit } : {}),
		afterSeconds: decision.descriptor.afterSeconds,
		beforeSeconds: decision.descriptor.beforeSeconds,
		orderby: decision.descriptor.orderby,
		order: decision.descriptor.order,
		complete: decision.descriptor.complete,
		perPage: Math.min(
			limit ?? WOO_REST_MAX_PER_PAGE,
			pullRequestLimit(task, pullBatchSize),
			WOO_REST_MAX_PER_PAGE
		),
	};
}

function payloadMetaValue(payload: WooOrderPayload, key: string): string | undefined {
	const metaData = (payload as { meta_data?: unknown }).meta_data;
	if (!Array.isArray(metaData)) return undefined;
	for (const entry of metaData) {
		if (entry === null || typeof entry !== 'object') continue;
		if ((entry as { key?: unknown }).key !== key) continue;
		const value = (entry as { value?: unknown }).value;
		if (value !== undefined && value !== null) return String(value);
	}
	return undefined;
}

/**
 * Whether a returned order actually carries the POS dimensions the descriptor asked for.
 *
 * `pos_cashier`, `pos_store` and `created_via` are WCPOS proxy params
 * (wcpos/woocommerce-pos#1432), NOT wc/v3 core params: a store still running an older
 * plugin ignores them silently and answers with the unfiltered superset. Recording that
 * superset as a COMPLETE lane would make the grid's projected total — which is the lane's
 * `expectedRecordIds.length`, with no local re-narrowing — report every cashier's and every
 * store's orders as the filtered total.
 *
 * Checking the records already in hand detects the old server without a capability
 * handshake or a version probe, and costs nothing once the companion ships: on a current
 * plugin every returned record matches and the lane completes exactly as before.
 */
function honorsRequestedDimensions(
	payload: WooOrderPayload,
	descriptor: { cashierId?: number; store?: string }
): boolean {
	if (
		descriptor.cashierId !== undefined &&
		payloadMetaValue(payload, '_pos_user') !== String(descriptor.cashierId)
	) {
		return false;
	}
	if (descriptor.store !== undefined) {
		const matched = /^\d+$/.test(descriptor.store)
			? payloadMetaValue(payload, '_pos_store') === descriptor.store
			: (payload as { created_via?: unknown }).created_via === descriptor.store;
		if (!matched) return false;
	}
	return true;
}

function targetedOrderIds(task: FetchTask): number[] {
	// Remote ids travel ONLY on the explicit remoteIds channel — independent of
	// the document-key encoding (storage keys are uuids since the P0-1 emit-flip, so the
	// server id is unrecoverable from the key). Every targeted seeder populates it
	// (seedTargetedLane); a targeted task without it is a contract violation, not
	// something to fall back from.
	if (!task.remoteIds || task.remoteIds.length === 0) {
		throw new Error(`Targeted order scheduler task is missing its remoteIds channel: ${task.id}`);
	}
	return task.remoteIds.map(wooIdOf);
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
	// the stamped uuid, and remoteId from payload.id — same as orderDocumentFromWooPayload. The
	// scheduler keys coverage + the pending-mutation pull guard off remoteId, so trusting a stale
	// envelope remoteId could record a correct payload under the wrong order or clobber a queued
	// local mutation. Owning both from the payload keeps the document internally consistent.
	const assembled = materializeLocalOnly(document.payload).storedDocument;
	return { ...assembled, sync: document.sync, local: document.local };
}

/**
 * The COVERAGE-record id for a pulled order — the stable Woo-id-space key
 * (`woo-order:<wooId>`), NOT the uuid STORAGE key (P0-1). Coverage stays in this space on
 * both sides of the lane gate (RxOrdersBrowser current-ids) and the targeted-records
 * store, which is seeded by wooId before any uuid exists — mirrors products'
 * coverageRecordId. Born-local orders with no remoteId fall back to the storage id.
 */
function orderCoverageRecordId(document: OrderDocument): string {
	return document.remoteId === null ? document.uuid : orderDocumentId(document.remoteId);
}

function shouldApplyStoredOrder(
	document: OrderDocument,
	pendingMutationOrderIds: ReadonlySet<string | number>
): boolean {
	if (pendingMutationOrderIds.has(document.uuid)) return false;
	return (
		document.remoteId === null ||
		(!pendingMutationOrderIds.has(document.remoteId) &&
			!pendingMutationOrderIds.has(wooIdOf(document.remoteId)))
	);
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

/**
 * The instant an order was created, in whole epoch seconds — the dimension the ranged walk
 * both SORTS by and CURSORS on (see RangedLaneResumeState).
 *
 * Woo serializes `date_created_gmt` with no zone designator (`2026-07-14T10:00:00`), which
 * `Date.parse` reads as LOCAL time. Pinning `Z` is the same trap the range bounds document in
 * requirement-bridge.ts — get it wrong and the cursor drifts by the store's UTC offset, which
 * on a resume silently skips (or re-downloads) hours of orders.
 */
function orderCreatedAtSeconds(payload: WooOrderPayload): number | null {
	const raw = (payload as { date_created_gmt?: unknown }).date_created_gmt;
	if (typeof raw !== 'string' || raw === '') return null;
	const milliseconds = Date.parse(/(?:Z|[+-]\d{2}:\d{2})$/i.test(raw) ? raw : `${raw}Z`);
	if (!Number.isFinite(milliseconds) || milliseconds < 0) return null;
	return Math.floor(milliseconds / 1_000);
}

function payloadWooId(payload: WooOrderPayload): number | null {
	const id = Number((payload as { id?: unknown }).id);
	return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * The oldest creation second on a page plus every id sharing it — the next cursor position.
 *
 * Records with no usable creation instant or id cannot move the cursor; they are still stored
 * and still counted as covered, they simply do not participate in the boundary. `null` means
 * the whole page was unusable, which leaves nowhere to resume from.
 */
function pageBoundary(payloads: WooOrderPayload[]): { seconds: number; wooIds: number[] } | null {
	let seconds: number | null = null;
	let wooIds: number[] = [];
	for (const payload of payloads) {
		const payloadSeconds = orderCreatedAtSeconds(payload);
		const wooId = payloadWooId(payload);
		if (payloadSeconds === null || wooId === null) continue;
		if (seconds === null || payloadSeconds < seconds) {
			seconds = payloadSeconds;
			wooIds = [wooId];
		} else if (payloadSeconds === seconds) {
			wooIds.push(wooId);
		}
	}
	return seconds === null ? null : { seconds, wooIds };
}

async function recordOrderFetchCoverage(
	input: OrdersSchedulerFetcherInput,
	task: FetchTask,
	documentIds: string[],
	complete: boolean,
	prefixAncestry?: BuildCoverageDocumentsFromQueryResultInput['prefixAncestry']
): Promise<void> {
	if (!input.coverageRepository) return;
	await input.coverageRepository.recordQueryResult({
		...orderCoverageInput(input, task, documentIds, complete),
		...(prefixAncestry ? { prefixAncestry } : {}),
	});
}

type RangedResumeSnapshot = {
	state: RangedLaneResumeState;
	coveredRecordCount: number;
};

/**
 * The lane's persisted continuation cursor, or null to start the range from its newest end.
 *
 * Resuming needs BOTH halves of the lane document — the cursor and the ids already covered —
 * and needs them to have been written together, so a port that cannot accumulate coverage
 * across passes (`recordCumulativeQueryResult`) never gets a cursor either: a walk that reset
 * `expectedRecordIds` on every pass while advancing the cursor would end up marking the lane
 * complete with only its LAST pass's records recorded.
 */
async function readRangedResumeState(
	input: OrdersSchedulerFetcherInput,
	task: FetchTask
): Promise<RangedResumeSnapshot | null> {
	const repository = input.coverageRepository;
	if (!repository?.readLocalLaneCoverage || !repository.recordCumulativeQueryResult) return null;
	const lane = await repository.readLocalLaneCoverage(
		'orders',
		task.queryKey,
		coverageNowMs(input)
	);
	if (!lane?.rangedResume) return null;
	return {
		state: lane.rangedResume,
		coveredRecordCount: lane.expectedRecordIds?.length ?? 0,
	};
}

async function publishRangedProgress(
	input: OrdersSchedulerFetcherInput,
	task: FetchTask,
	resume: RangedLaneResumeState,
	expected: RangedLaneResumeState | null
): Promise<void> {
	if (!input.coverageRepository?.publishRangedResume) return;
	await input.coverageRepository.publishRangedResume({
		collection: 'orders',
		queryKey: task.queryKey,
		resume,
		expected,
		nowMs: coverageNowMs(input),
		freshForMs: input.coverageFreshForMs ?? DEFAULT_COVERAGE_FRESH_FOR_MS,
	});
}

type RangedCoverageWrite = {
	documentIds: string[];
	complete: boolean;
	previousResume: RangedResumeSnapshot | null;
	/** Where the walk's cursor stood when the pass ended. */
	cursorBeforeSeconds: number | undefined;
	cursorExcludeWooIds: number[];
	/** `X-WP-Total` for this pass's narrowed window — the uncovered remainder. */
	remainingTotal: number | null;
	/** Whether the walk reached the end of the range (short page / advertised last page). */
	exhausted: boolean;
	/** Whether every record this pass saw actually carried the descriptor's POS dimensions. */
	dimensionsHonored: boolean;
	/** The cursor last PERSISTED by this pass — what the final write's ancestry must match. */
	publishedResume: RangedLaneResumeState | null;
};

/**
 * Record one PASS of a ranged fetch-to-completion walk: accumulate its records into the lane
 * and persist — or, once the range is exhausted, clear — the cursor the next pass resumes from.
 */
async function recordRangedOrderFetchCoverage(
	input: OrdersSchedulerFetcherInput,
	task: FetchTask,
	write: RangedCoverageWrite
): Promise<void> {
	const repository = input.coverageRepository;
	if (!repository) return;
	if (!repository.recordCumulativeQueryResult) {
		// No cumulative channel — behave exactly as #941 did: one non-resumable pass.
		await recordOrderFetchCoverage(input, task, write.documentIds, write.complete);
		return;
	}

	const previous = write.previousResume;
	const coveredBefore = previous?.coveredRecordCount ?? 0;
	const resume: RangedLaneResumeState | null =
		// A pass that saw a server ignoring the descriptor's POS dimensions must NOT leave a
		// cursor behind. `dimensionsHonored` is per-pass evidence, so a superset accumulated by
		// pass one would otherwise be completed by a later pass that happened to see only
		// matching records — reporting every cashier's orders as this cashier's total, which is
		// exactly what the check exists to prevent. Dropping the cursor restarts the whole walk,
		// so an old plugin behaves as it did before #954: honest, incomplete, never accumulating.
		write.exhausted || !write.dimensionsHonored || write.cursorBeforeSeconds === undefined
			? null
			: {
					beforeSeconds: write.cursorBeforeSeconds,
					excludeWooIds: write.cursorExcludeWooIds,
					totalRecords:
						write.remainingTotal === null
							? (previous?.state.totalRecords ?? null)
							: coveredBefore + write.remainingTotal,
					downloadedRecords: coveredBefore + write.documentIds.length,
				};

	await repository.recordCumulativeQueryResult({
		...orderCoverageInput(input, task, write.documentIds, write.complete),
		// A pass with no cursor is the START of a walk, so it must not inherit the ids a
		// previous (now superseded) walk of the same lane accumulated.
		resetCumulativeExpectedIds: previous === null,
		rangedResume: resume,
		// Lets the write reject an advance whose starting cursor no longer exists — see the
		// cursor-ancestry note in RxCoverageRepository.recordCumulativeQueryResult.
		rangedResumeExpected: write.publishedResume,
	});
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

/**
 * MONETARY PRECISION — do NOT add `dp=6` to any order read URL below (#946).
 *
 * 1.9 delivered six-decimal money on every order read, but it did so SERVER-side:
 * `V1\Orders_Controller::wcpos_dispatch_request` forced `$request->set_param('dp','6')`
 * on the dispatched request, and the client's `dp: 6` (packages/query, deleted in #662)
 * was belt-and-braces on top of it. The v2 sync lane never carried the server pin over,
 * so pulled orders now arrive at the store's display decimals (typically 2dp) and
 * sub-cent tax components round away.
 *
 * Restoring the param HERE alone would trade that rounding bug for a much worse one.
 * The plugin stamps each proxied record's `_rxdb_revision` by hashing the payload AS
 * SERVED (Sync/Revision.php::stamp_proxy_revisions → Order_Serializer::canonical_revision),
 * and the client adopts that stamp as `sync.revision` (adoptStampedRevision) — its
 * baseRevision for the next push. The write path recomputes the revision from a
 * SYNTHETIC re-read that carries no `dp` (V2\Write_Controller::document_for /
 * revision_matches_with_grace), so a client holding a 6dp-derived hash would fail the
 * optimistic-concurrency check — a false 409 on every edit of a pulled order, with the
 * legacy_revision grace path unable to bridge it either.
 *
 * The fix belongs server-side, pinned atomically across every order serialization so all
 * of them hash identical bytes: Order_Serializer::serialize_order (covers /orders/pull,
 * sync-index revision generation and the grace recompute), Catalog_Proxy_Controller::proxy
 * for the orders forward, and Write_Controller::document_for — plus a sync-index revision
 * rebuild, since the planner trusts already-persisted rows. Once that lands the client
 * needs no param at all; precision becomes a server guarantee no client can forget.
 *
 * What this file DOES owe #946 is carrying whatever precision the server sends straight
 * through to storage, unrounded and unreformatted — pinned for every read shape by
 * "preserves server monetary precision verbatim on every order read shape" in the test.
 */
async function fetchBrowserOrderQuery(
	input: OrdersSchedulerFetcherInput,
	task: FetchTask,
	descriptor: NonNullable<ReturnType<typeof browserOrderQueryDescriptor>>,
	continuation: BrowseWindowContinuation,
	context?: SchedulerFetcherContext
): Promise<FetchTaskResult> {
	if (task.collection !== 'orders') {
		throw new Error(`Orders scheduler fetcher cannot run ${task.collection} tasks`);
	}

	let documentCount = 0;
	let requestCount = 0;
	const fetchedDocumentIds: string[] = [];
	let exhausted = false;
	let dimensionsHonored = true;

	// #954: a fetch-to-completion lane resumes where the last pass stopped. The cursor is read
	// REGARDLESS of coverage freshness — freshness governs whether the lane may be BELIEVED
	// complete, while the cursor records work already done, and a multi-pass walk of a large
	// range routinely outlives the 5-minute freshness window. Throwing the cursor away because
	// the lane went stale would restore exactly the never-converging re-download this fixes.
	const previousResume = descriptor.complete ? await readRangedResumeState(input, task) : null;
	let remainingTotal: number | null = null;
	// The cursor narrows the descriptor's own upper bound; it never widens it.
	let cursorBeforeSeconds =
		previousResume === null
			? descriptor.beforeSeconds
			: descriptor.beforeSeconds === undefined
				? previousResume.state.beforeSeconds
				: Math.min(descriptor.beforeSeconds, previousResume.state.beforeSeconds);
	let cursorExcludeWooIds = previousResume?.state.excludeWooIds ?? [];
	// The cursor most recently PERSISTED for this lane — the ancestry expectation each
	// subsequent write must match. It starts as the cursor the pass resumed from and advances
	// with every per-page publish, so a wipe mid-pass is caught at the very next write.
	let publishedResume: RangedLaneResumeState | null = previousResume?.state ?? null;

	const windowLimit = descriptor.limit ?? RANGED_COMPLETE_MAX_RECORDS;
	// #957 — the WINDOWED analogue of the ranged cursor above, and deliberately a different
	// mechanism. A ranged walk owns its whole range and re-cursors by DATE; a scroll window
	// takes a bounded positional slice of the same listing, so it resumes at a RECORD
	// OFFSET. `covered` is always 0 on the ranged path (the continuation is refused for
	// `descriptor.complete`), so the two never interact.
	const covered = continuation.covered;
	const recordLimit = windowLimit - covered;
	const skipInResumePage = covered % descriptor.perPage;
	let nextPageNumber = Math.floor(covered / descriptor.perPage) + 1;
	// See the page-budget note in the loop: only a walk that can resume may be truncated.
	const resumable = !descriptor.complete && descriptor.search === '';
	while (documentCount < recordLimit) {
		// The per-drain page budget only applies to a walk that can RESUME. Truncating one
		// that cannot is not a pause, it is a ceiling: the walk would stop at the same page
		// every attempt and the records beyond it could never load. Two walks are exempt:
		//  - a ranged fetch-to-completion (Reports), which carries #954's own cursor and is
		//    bounded by RANGED_COMPLETE_MAX_RECORDS; and
		//  - a SEARCH-scoped window, whose coverage goes through `recordRecords` — that
		//    writes no lane document, so `readBrowseWindowContinuation` has nothing to
		//    resume from. Its work is still bounded by the window the cashier asked for.
		if (resumable && requestCount >= BROWSE_WINDOW_MAX_PAGES_PER_DRAIN) break;
		const query = new URLSearchParams();
		if (descriptor.status) query.set('status', descriptor.status);
		if (descriptor.search) query.set('search', descriptor.search);
		if (descriptor.customerId !== undefined) query.set('customer', String(descriptor.customerId));
		if (descriptor.cashierId !== undefined) query.set('pos_cashier', String(descriptor.cashierId));
		if (descriptor.store !== undefined) {
			query.set(/^\d+$/.test(descriptor.store) ? 'pos_store' : 'created_via', descriptor.store);
		}
		if (descriptor.afterSeconds !== undefined)
			query.set('after', new Date(descriptor.afterSeconds * 1_000).toISOString());
		if (cursorBeforeSeconds !== undefined)
			query.set('before', new Date(cursorBeforeSeconds * 1_000).toISOString());
		if (descriptor.afterSeconds !== undefined || cursorBeforeSeconds !== undefined) {
			query.set('dates_are_gmt', 'true');
		}
		// The boundary second is re-requested inclusively; the ids already taken from it are
		// dropped server-side (`exclude` → `post__not_in`), so neither a tie group split across
		// a page boundary is missed nor an already-stored record re-downloaded.
		if (cursorExcludeWooIds.length > 0) query.set('exclude', cursorExcludeWooIds.join(','));
		query.set('per_page', String(descriptor.perPage));
		// A fetch-to-completion walk re-cursors EVERY request, so it always asks for page 1 of a
		// window that has just shrunk. Positional paging (`page`/`offset`) would drift under
		// concurrent writes: an order inserted into the range mid-walk pushes every later record
		// down a slot (re-download), and a trashed one pulls them up (a silent skip). The date
		// bound is content-addressed, so neither can move it. Windowed lanes keep page paging —
		// they take a bounded slice, not the whole range, and are not resumable.
		// A windowed lane resumes at its record offset (#957), so its page number comes from
		// the continuation rather than from the request counter.
		query.set('page', String(descriptor.complete ? 1 : nextPageNumber));
		// A fetch-to-completion lane walks `date desc` NO MATTER what the grid asked to sort by:
		// the cursor is a date bound, and a cursor that does not share the walk's ordering can
		// skip records (an id-desc walk cannot express "everything older than X" to wc/v3, which
		// has no id bound — see RangedLaneResumeState). Server ordering is invisible to the
		// screen here: the lane downloads the WHOLE range and the grid sorts local residents,
		// while the lane's `expectedRecordIds` is consumed only as a count (projectTotal).
		// Windowed lanes keep the descriptor's sort, which is what decides WHICH records they get.
		query.set('orderby', descriptor.complete ? 'date' : (descriptor.orderby ?? 'id'));
		query.set('order', descriptor.complete ? 'desc' : (descriptor.order ?? 'desc'));

		const url = `${input.baseUrl}/orders?${query.toString()}`;
		const response = await httpGet(input, url, context);
		if (!response.ok) {
			throw new Error(`Woo REST browser order query request failed: ${response.status}`);
		}

		const totalPagesHeader = response.headers.get('X-WP-TotalPages');
		const totalPages = Number(totalPagesHeader);
		if (requestCount === 0) {
			// `X-WP-Total` for THIS pass's (already narrowed) window is the uncovered remainder;
			// added to what earlier passes covered it gives the range total the progress line needs.
			// A MISSING header must stay `null`, not become 0 — `Number(null)` is 0, and a zero
			// remainder would tell the cashier the download had already finished.
			const totalHeader = response.headers.get('X-WP-Total');
			const total = Number(totalHeader);
			remainingTotal =
				totalHeader !== null && Number.isSafeInteger(total) && total >= 0 ? total : null;
		}
		const rawPayloads = JSON.parse(await response.text()) as WooOrderPayload[];
		// Rows of the resume page the covered prefix already holds — dropped before they
		// are counted or persisted, so a continuation never double-counts the seam. Always a
		// no-op on the ranged path (`covered` is 0) and, since #957's continuation gate only
		// offsets from a page-aligned prefix, a no-op on the windowed path too; kept as the
		// explicit guard that makes the raw/sliced distinction below correct by construction.
		const payloads =
			requestCount === 0 && skipInResumePage > 0
				? rawPayloads.slice(skipInResumePage)
				: rawPayloads;
		if (!payloads.every((payload) => honorsRequestedDimensions(payload, descriptor))) {
			dimensionsHonored = false;
		}
		const remaining = recordLimit - documentCount;
		const kept = payloads.slice(0, remaining);
		if (descriptor.complete && kept.length > 0) {
			const boundary = pageBoundary(kept);
			if (boundary === null) {
				throw new Error(
					`Ranged order walk cannot advance ${task.queryKey}: no record on this page carries a usable date_created_gmt`
				);
			}
			// The page's oldest second becomes the new bound. `before` is EXCLUSIVE in WP_Date_Query
			// (`inclusive` defaults false, on both the CPT and HPOS paths), so a returned record is
			// always strictly older than the current bound and the bound can only fall or hold.
			// The clamp makes that a guarantee rather than a server promise: if some future
			// WooCommerce made `before` inclusive, an unclamped bound would RISE and the walk would
			// loop forever. Clamped, such a page still makes progress through the exclusion list.
			const nextBeforeSeconds = Math.min(
				boundary.seconds + 1,
				cursorBeforeSeconds ?? Number.MAX_SAFE_INTEGER
			);
			// Holding at the same second means the page never left it, so the ids already taken from
			// it must accumulate; moving past it retires them.
			const advanced = cursorBeforeSeconds === undefined || nextBeforeSeconds < cursorBeforeSeconds;
			cursorExcludeWooIds = advanced
				? boundary.wooIds
				: [...new Set([...cursorExcludeWooIds, ...boundary.wooIds])];
			cursorBeforeSeconds = nextBeforeSeconds;
			if (cursorExcludeWooIds.length > RANGED_RESUME_MAX_EXCLUDED_IDS) {
				// Truncating the exclusion list would re-request the same second forever; dropping
				// it would skip whatever the truncation hid. Neither is acceptable, so stop loudly:
				// the task fails into retry backoff and the lane stays honestly incomplete.
				throw new Error(
					`Ranged order walk cannot advance ${task.queryKey}: more than ${RANGED_RESUME_MAX_EXCLUDED_IDS} orders share the boundary second ${boundary.seconds}`
				);
			}
		}
		const documents = kept.map(orderDocumentFromWooPayload);
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
			? documents.filter((document) => shouldApplyStoredOrder(document, pending))
			: documents;
		await input.repository.upsertMany(applicable);
		fetchedDocumentIds.push(...documents.map(orderCoverageRecordId));
		documentCount += documents.length;
		requestCount += 1;

		if (descriptor.complete && cursorBeforeSeconds !== undefined) {
			// Publish progress + cursor per PAGE: it lights the Reports progress line during the
			// FIRST pass (the whole walk for any range under the bound), keeps the incomplete lane
			// fresh so compaction cannot delete it mid-pass, and makes the walk resumable from the
			// last page rather than the last pass if the app dies here.
			const pageResume: RangedLaneResumeState = {
				beforeSeconds: cursorBeforeSeconds,
				excludeWooIds: cursorExcludeWooIds,
				totalRecords:
					remainingTotal === null
						? (previousResume?.state.totalRecords ?? null)
						: (previousResume?.coveredRecordCount ?? 0) + remainingTotal,
				downloadedRecords: (previousResume?.coveredRecordCount ?? 0) + documentCount,
			};
			await publishRangedProgress(input, task, pageResume, publishedResume);
			publishedResume = pageResume;
		}

		// A short page is the usual end-of-walk signal, but a range whose total is an exact
		// multiple of the page size never produces one — every page is full. Woo advertises
		// the last page in `X-WP-TotalPages` (the same signal the product fetcher and the
		// customer trickle already stop on), so honour it rather than requesting a page past
		// the end and failing the whole task after downloading every record. A cursored walk
		// always asks for page 1, so its own advertised-last-page test is `totalPages <= 1`;
		// a windowed walk compares the page it JUST fetched (#957 resumes at an offset, so
		// that is `nextPageNumber`, not the request counter).
		//
		// The short-page signal below reads the RAW page: the resume-page skip shortens
		// `payloads` without the server having run out, and would otherwise fake exhaustion.
		const atAdvertisedLastPage =
			totalPagesHeader !== null &&
			Number.isSafeInteger(totalPages) &&
			(descriptor.complete ? totalPages <= 1 : nextPageNumber >= totalPages);
		nextPageNumber += 1;
		if (
			(rawPayloads.length < descriptor.perPage || atAdvertisedLastPage) &&
			payloads.length <= remaining &&
			!(descriptor.complete && documentCount >= RANGED_COMPLETE_MAX_RECORDS)
		) {
			exhausted = true;
			break;
		}
	}

	// #957 windowed bookkeeping. Every piece below is inert on the ranged path: the
	// continuation is refused for `descriptor.complete`, so `covered` is 0, the budget never
	// applies, and the ancestry guard has no carried prefix to check.
	//
	// The per-drain page budget bit before the window filled: the lane must not claim
	// completeness, and the next drain resumes from the prefix this one leaves.
	const truncatedByPageBudget = resumable && !exhausted && documentCount < recordLimit;

	if (descriptor.complete && descriptor.search === '') {
		// The RANGED (Reports) lane keeps its own completion contract (#954): it is written
		// cumulatively from its date cursor, not from a window prefix, so it does not run the
		// shared browse-window tail at all.
		await recordRangedOrderFetchCoverage(input, task, {
			documentIds: fetchedDocumentIds,
			// A superset from a server that ignored the POS dimensions is still worth keeping
			// locally — it is real order data — but it must never be recorded as a COMPLETE lane
			// for this descriptor, or the grid reports the superset's size as its total.
			complete: exhausted && dimensionsHonored,
			previousResume,
			cursorBeforeSeconds,
			cursorExcludeWooIds,
			remainingTotal,
			exhausted,
			dimensionsHonored,
			publishedResume,
		});
	} else {
		// A superset from a server that ignored the POS dimensions is still worth keeping
		// locally — it is real order data — but the lane must claim NO coverage for it.
		// `complete:false` alone does not prevent it being SERVED: a filled-but-incomplete lane
		// is exactly what an ordinary un-exhausted window looks like, so the serve-local gate
		// would answer a cashier/store-filtered window from rows that were never filtered, for
		// a whole freshness window.
		await finalizeBrowseWindowLane({
			collection: 'orders',
			queryKey: task.queryKey,
			windowLimit,
			continuation,
			deltaRecordIds: fetchedDocumentIds,
			serverExhausted: exhausted,
			truncatedByPageBudget,
			dimensionsHonored,
			// An orders window is complete only when the SERVER ran out of matching orders: a
			// merge that came back short means the listing shifted under the resume offset (an
			// order created or trashed between two growth steps), and recording that complete
			// would freeze the window with a hole in it.
			requireServerExhaustedForComplete: true,
			skipLaneWriteWithoutProgress: false,
			pageBudget: {
				message: `Orders browse window paused after ${requestCount} pages with ${covered + documentCount} of ${windowLimit} rows covered; the next drain resumes from there`,
				emitBeforeAncestryCheck: true,
			},
			prefixInvalidatedMessage: `Orders browse window ${windowLimit} lost the coverage it was continuing from mid-walk; restarting it from the top next pass`,
			identify: orderBrowseWindowLaneIdentity,
			evictionRepository: input.coverageRepository,
			readLane: input.coverageRepository?.readLocalLaneCoverage,
			nowMs: coverageNowMs(input),
			diagnostics: input.diagnostics,
			writer: {
				recordRecordsOnly: (recordIds) => recordOrderFetchedRecords(input, task, recordIds),
				// A SEARCH-scoped window writes no lane: its coverage goes to records only, so it
				// has nothing to supersede with and nothing a later pass could resume from.
				...(descriptor.search === ''
					? {
							recordLane: ({ recordIds, complete, prefixAncestry }) =>
								recordOrderFetchCoverage(input, task, recordIds, complete, prefixAncestry),
						}
					: {}),
			},
		});
	}

	return {
		taskId: task.id,
		documentCount,
		requestCount,
		// A fetch-to-completion lane reports HONESTLY whether the range is finished: it runs as a
		// greedy task, and the runner keeps calling until this is true, so claiming completion
		// after a bounded pass would strand the range at its first 10,000 records. A windowed
		// browse is complete by construction — its window is the bound.
		completed: descriptor.complete ? exhausted : true,
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
		// No `dp` — see the monetary-precision note above fetchBrowserOrderQuery (#946).
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
			? documents.filter((document) => shouldApplyStoredOrder(document, pending))
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
			// #957: ask coverage how much of this window is already held before walking it,
			// so extending the grid past the old 200-record ceiling costs one page per step
			// rather than re-downloading the window. Deliberately NOT applied to a ranged
			// fetch-to-completion (`limit=all`, Reports): that is not a scroll window, and
			// it owns its own completion semantics.
			const predecessor = browserDescriptor.complete
				? null
				: orderBrowserPredecessorWindow(task.queryKey, browserDescriptor.limit!);
			const continuation = browserDescriptor.complete
				? NO_BROWSE_WINDOW_CONTINUATION
				: await readBrowseWindowContinuation({
						collection: 'orders',
						ownQueryKey: task.queryKey,
						predecessorQueryKey: predecessor?.queryKey ?? null,
						predecessorLimit: predecessor?.limit ?? 0,
						limit: browserDescriptor.limit!,
						pageSize: browserDescriptor.perPage,
						nowMs: input.nowMs?.() ?? Date.now(),
						readLane: input.coverageRepository?.readLocalLaneCoverage,
						forceRefresh: input.refreshBrowseWindowKey === task.queryKey,
					});
			if (continuation.satisfied) {
				// Fresh coverage already holds this whole window: serve local. No coverage
				// rewrite — the lane keeps its own expiry so the window is still re-walked.
				return { taskId: task.id, documentCount: 0, requestCount: 0, completed: true };
			}
			return fetchBrowserOrderQuery(input, task, browserDescriptor, continuation, context);
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
			// (repository.removeDeletedOrders resolves remoteId→uuid + guards pending/dirty).
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
