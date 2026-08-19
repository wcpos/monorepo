/**
 * Customer scheduler fetcher — an ON-DEMAND collection (targeted include= fetch by id, search-windowed
 * paginate, or the sorted BROWSE WINDOW added by #951). The targeted/search halves are a thin spec over the
 * shared core (createTargetedSearchCollectionFetcher); only the customer-specific deltas live here: uuid
 * identity, the dual-id-space coverage key, the document-id target parser, the customer:default born-local
 * sentinel, the search-lane queryKey grammar, and the browse-window walk.
 */

import { customerDocumentId, remoteIdOrNull, type SyncObserver } from '@wcpos/sync-core';

import {
	type LocalCustomerDocument,
	type WooCustomerPayload,
} from '../collections/customer-schema';
import { materializeTargeted } from '../materialization/record-materialization';
import {
	type CustomerBrowseWindowDescriptor,
	customerBrowseWindowQueryParams,
	parseCustomerBrowseWindowDescriptor,
} from './customer-browse-window-descriptor';
import { WOO_REST_MAX_PER_PAGE } from './order-browser-scheduler-descriptor';
import { censusQueryKey } from './census';
import { queryTotalFromResponse } from './query-total-requests';
import {
	type CollectionSchedulerCoverageRepository,
	type CollectionSchedulerInput,
	type CollectionTarget,
	createTargetedSearchCollectionFetcher,
	httpGet,
	recordCoverage,
} from './rx-scheduler-collection-fetcher';
// prettier-ignore
import { type FetchTask, type FetchTaskResult, pullRequestLimit, type SchedulerFetcher, type SchedulerFetcherContext } from './replication-policy';

export type CustomerSchedulerCoverageRepository = CollectionSchedulerCoverageRepository;

export type CustomerSchedulerFetcherInput = CollectionSchedulerInput<LocalCustomerDocument> & {
	diagnostics?: SyncObserver;
};

function customerTargetFromDocumentId(id: string): CollectionTarget {
	if (id === 'customer:default') {
		return { documentId: id, remoteId: null };
	}
	const match = /^woo-customer:(\d+)$/.exec(id);
	if (!match)
		throw new Error(`Targeted customer scheduler task id is not a Woo customer document id: ${id}`);
	const remoteId = remoteIdOrNull(match[1]);
	if (remoteId === null) throw new Error(`Invalid Woo customer id: ${match[1]}`);
	return { documentId: customerDocumentId(remoteId), remoteId };
}

function revisionFromCustomer(payload: WooCustomerPayload): string {
	return String(payload.date_modified_gmt ?? payload.date_modified ?? '');
}

function customerDocumentFromWooPayload(payload: WooCustomerPayload): LocalCustomerDocument {
	return materializeTargeted('customers', payload).storedDocument as LocalCustomerDocument;
}

/**
 * The COVERAGE-record id for a customer — the stable Woo-id-space key (`woo-customer:<wooId>`), NOT the uuid
 * STORAGE key (P0-1). Coverage/lane ids stay in this space so the targeted side (which extracts remoteId) and
 * the search lane's expectedRecordIds agree. The customer:default sentinel (remoteId null) falls through to
 * its literal storage id.
 */
function customerCoverageRecordId(document: LocalCustomerDocument): string {
	return document.remoteId === null ? document.uuid : customerDocumentId(document.remoteId);
}

function defaultCustomerDocument(target: CollectionTarget): LocalCustomerDocument {
	return {
		uuid: target.documentId,
		remoteId: null,
		payload: {},
		sync: { revision: '', partial: true, source: 'woo-rest' },
		local: { dirty: false, pendingMutationIds: [] },
	};
}

function parseCustomerSearchQuery(task: FetchTask): { search: string; queryLimit: number } | null {
	const match = /^customers:search=([^:]*):limit=(\d+)$/.exec(task.queryKey);
	if (!match) return null;
	return { search: decodeURIComponent(match[1] ?? ''), queryLimit: Number(match[2]) };
}

/**
 * Walk one customers browse window (#951).
 *
 * TWO INDEPENDENT SIZES (#908). `descriptor.limit` is the WINDOW — how many rows the grid
 * wants, uncapped (R8). `pageSize` is the WIRE page — `per_page` on each request, governed by
 * the Performance dial. The window is walked in ceil(limit / pageSize) pages, so a 500-row
 * window at pullBatchSize=25 is twenty polite requests rather than one heavy one.
 *
 * `role=all` is sent EXPLICITLY. The v2 proxy already defaults an omitted role to `all`
 * (#1379: the POS customer space is every WordPress user, matching 1.9), but the #850-era
 * lesson is that the client must not depend on a server-side default it can state itself — a
 * proxy that stopped applying it would silently narrow every browse to `role=customer` and
 * look like missing data, not like a regression. It comes from
 * `customerBrowseWindowQueryParams`, shared with the idle backfill so the two lanes cannot
 * express this window as two different requests.
 *
 * The server's `X-WP-Total` for this exact sorted view is cached against the window's
 * queryKey, so the grid footer can report the real total instead of the resident count. The
 * coverage lane is recorded COMPLETE only when the server ran out before the window did —
 * otherwise a 100-row lane over a 5,000-customer store would be read as "that's all of them".
 */
async function fetchCustomerBrowseWindow(
	input: CustomerSchedulerFetcherInput,
	task: FetchTask,
	descriptor: CustomerBrowseWindowDescriptor,
	pageSize: number,
	context?: SchedulerFetcherContext
): Promise<FetchTaskResult> {
	const { limit } = descriptor;
	const query = customerBrowseWindowQueryParams(descriptor);
	query.set('per_page', String(pageSize));

	const payloads: WooCustomerPayload[] = [];
	let requestCount = 0;
	let totalPages: number | null = null;
	let totalRecords: number | null = null;
	let exhausted = false;

	while (payloads.length < limit) {
		query.set('page', String(requestCount + 1));
		const url = `${input.baseUrl}/customers?${query.toString()}`;
		const response = await httpGet(input, url, context);
		if (!response.ok) {
			// A 400 here is almost always a customer `orderby` this store's plugin does not
			// proxy — a build predating #1488, which re-applies the five WCPOS sorts through the
			// V1 handler. Surface it as a labelled event so it is diagnosable from the Logs
			// screen instead of showing up as a bare failed drain; the grid keeps local results.
			if (response.status === 400) {
				input.diagnostics?.({
					type: 'customer.browse-window.sort-rejected',
					level: 'warn',
					collection: 'customers',
					message: `Store rejected the customers browse sort "${descriptor.orderby} ${descriptor.order}"`,
				});
			}
			throw new Error(`Woo REST customer browse request failed: ${response.status}`);
		}
		requestCount += 1;
		const pagePayloads = JSON.parse(await response.text()) as WooCustomerPayload[];
		payloads.push(...pagePayloads);
		// Read the RAW header first: a proxy (or a browser whose CORS response omits
		// `Access-Control-Expose-Headers`) hides these, and `Number(null)` is 0 — which would
		// cache a FRESH ZERO total and make the footer report 0 for five minutes while rows are
		// on screen. An unknown total must stay unknown so the footer falls back to local.
		const observedTotal = queryTotalFromResponse(response);
		if (observedTotal !== null) totalRecords = observedTotal;
		const rawPages = response.headers.get('X-WP-TotalPages');
		if (rawPages !== null) {
			const headerPages = Number(rawPages);
			if (Number.isSafeInteger(headerPages) && headerPages > 0) totalPages = headerPages;
		}
		if (pagePayloads.length < pageSize) {
			exhausted = true;
			break;
		}
		// A result set that is an exact multiple of pageSize never yields a short page, so a
		// short page alone cannot detect exhaustion: without this the walk asks for one page
		// past the last, which WP answers with a 400 and this turns into a failed browse. Same
		// class as the products fix in the phase-1 loop of fetchProductBrowseWindow.
		if (totalPages !== null && requestCount >= totalPages) {
			exhausted = true;
			break;
		}
	}

	// Offset pagination is not stable across requests: a customer created (or deleted) between
	// two page requests shifts every later page, so a boundary row can arrive twice. RxDB's
	// bulkUpsert REJECTS an input carrying duplicate primary keys (COL22), which would fail the
	// whole browse after several otherwise-successful requests. Dedupe on the materialized
	// storage id, keeping the first sighting so the server's ordering is preserved.
	const documentsById = new Map<string, LocalCustomerDocument>();
	for (const payload of payloads) {
		const document = customerDocumentFromWooPayload(payload);
		if (!documentsById.has(document.uuid)) documentsById.set(document.uuid, document);
		if (documentsById.size === limit) break;
	}
	const documents = [...documentsById.values()];
	await input.repository.upsertMany(documents);
	// COMPLETE means "this lane holds every customer matching the query", which is true only
	// when the server ran out inside the window. A truncated walk records an incomplete lane so
	// projectTotal falls through to the cached server total rather than reporting the window
	// size as the customer count (#894/#945).
	await recordCoverage(
		'customers',
		input,
		task,
		documents.map(customerCoverageRecordId),
		exhausted && payloads.length <= limit
	);
	if (input.cacheQueryTotals && totalRecords !== null) {
		await input.cacheQueryTotals({
			queryKeys: [task.queryKey, censusQueryKey('customers')],
			totalMatchingRecords: totalRecords,
		});
	}

	return { taskId: task.id, documentCount: documents.length, requestCount, completed: true };
}

export function createCustomerSchedulerFetcher(
	input: CustomerSchedulerFetcherInput
): SchedulerFetcher {
	const targetedSearchFetcher = createTargetedSearchCollectionFetcher<
		LocalCustomerDocument,
		WooCustomerPayload
	>(
		{
			collection: 'customers',
			endpoint: 'customers',
			label: 'Customer',
			restLabel: 'customer',
			documentFromPayload: customerDocumentFromWooPayload,
			coverageRecordId: customerCoverageRecordId,
			payloadWooId: (payload) => Number(payload.id),
			targetFromId: customerTargetFromDocumentId,
			defaultDocument: defaultCustomerDocument,
			parseSearchQuery: parseCustomerSearchQuery,
		},
		input
	);

	return async (task: FetchTask, context?: SchedulerFetcherContext): Promise<FetchTaskResult> => {
		// The browse window is checked BEFORE delegating: it shares the `customers:` namespace
		// with the targeted and search lanes, and only the descriptor parser can tell them apart.
		// Targeted tasks still win — a task that names ids is a deep-link pull, never a browse.
		if (!task.documentIds || task.documentIds.length === 0) {
			const browseWindow = parseCustomerBrowseWindowDescriptor(task.queryKey);
			if (browseWindow !== null) {
				if (!Number.isSafeInteger(task.limit) || task.limit <= 0) {
					throw new Error('Customer scheduler task limit must be a positive integer');
				}
				// The window limit is a coverage total, not a request size — the batch dial must
				// not shrink it. The dial governs the WIRE page instead (#908).
				const limit = Math.min(browseWindow.limit, task.limit);
				const pageSize = Math.min(
					pullRequestLimit({ ...task, limit }, input.pullBatchSize),
					WOO_REST_MAX_PER_PAGE
				);
				return fetchCustomerBrowseWindow(
					input,
					task,
					{ ...browseWindow, limit },
					pageSize,
					context
				);
			}
		}
		return targetedSearchFetcher(task, context);
	};
}
