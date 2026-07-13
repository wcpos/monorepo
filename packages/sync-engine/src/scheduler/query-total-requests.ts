import type { QueryTotalDiscoveryDecision } from './query-total-discovery';

/**
 * Query-total POLICY WINDOWS — one home, imported by every consumer (the
 * request runner, the mount kit's durable retry scan, and the host), so the
 * lease/retry/freshness discipline can't drift between them.
 */
export const QUERY_TOTAL_LEASE_FOR_MS = 30 * 1_000;
export const QUERY_TOTAL_RETRY_AFTER_MS = 30 * 1_000;
export const QUERY_TOTAL_FRESH_FOR_MS = 5 * 60 * 1_000;

export type QueryTotalRequestAction =
	| 'skip-not-needed'
	| 'use-cached-total'
	| 'wait-for-in-flight'
	| 'skip-offline'
	| 'enqueue-total-request';

export type QueryTotalConnectivity = 'online' | 'offline';

export type QueryTotalCacheStatus = 'not-needed' | 'missing' | 'fresh' | 'stale';

export type QueryTotalCacheEntry = {
	queryKey: string;
	totalMatchingRecords: number;
	freshUntilMs: number;
	updatedAtMs: number;
};

export type QueryTotalRequestParams = Record<string, string | number | boolean>;

export type QueryTotalWooRequest = {
	queryKey: string;
	method: 'GET';
	endpoint: string;
	params: QueryTotalRequestParams;
	totalHeader: 'X-WP-Total';
};

export type QueryTotalRequestPlannerInput = {
	discovery: QueryTotalDiscoveryDecision;
	connectivity: QueryTotalConnectivity;
	nowMs: number;
	endpoint: string;
	filters: Record<string, string | number | boolean | null | undefined>;
	cacheEntries: QueryTotalCacheEntry[];
	inFlightQueryKeys: string[];
};

export type QueryTotalRequestDecision = {
	queryKey: string;
	action: QueryTotalRequestAction;
	reason: string;
	totalMatchingRecords: number | null;
	request: QueryTotalWooRequest | null;
	cacheStatus: QueryTotalCacheStatus;
};

function cacheStatus(
	entry: QueryTotalCacheEntry | undefined,
	nowMs: number
): QueryTotalCacheStatus {
	if (!entry) return 'missing';
	return entry.freshUntilMs > nowMs ? 'fresh' : 'stale';
}

function requestParams(filters: QueryTotalRequestPlannerInput['filters']): QueryTotalRequestParams {
	const params: QueryTotalRequestParams = {};
	for (const [key, value] of Object.entries(filters)) {
		if (value !== null && value !== undefined) {
			params[key] = value;
		}
	}
	return { ...params, page: 1, per_page: 1 };
}

export function planQueryTotalRequest(
	input: QueryTotalRequestPlannerInput
): QueryTotalRequestDecision {
	const { discovery } = input;
	if (!discovery.shouldRequestQueryTotal) {
		return {
			queryKey: discovery.queryKey,
			action: 'skip-not-needed',
			reason: 'query total discovery did not request a Woo total',
			totalMatchingRecords: null,
			request: null,
			cacheStatus: 'not-needed',
		};
	}

	const cachedTotal = input.cacheEntries.find((entry) => entry.queryKey === discovery.queryKey);
	const status = cacheStatus(cachedTotal, input.nowMs);
	if (cachedTotal && status === 'fresh') {
		return {
			queryKey: discovery.queryKey,
			action: 'use-cached-total',
			reason: 'fresh cached query-specific Woo total is available',
			totalMatchingRecords: cachedTotal.totalMatchingRecords,
			request: null,
			cacheStatus: status,
		};
	}

	if (input.inFlightQueryKeys.includes(discovery.queryKey)) {
		return {
			queryKey: discovery.queryKey,
			action: 'wait-for-in-flight',
			reason: 'an equivalent query-specific total request is already in flight',
			totalMatchingRecords: null,
			request: null,
			cacheStatus: status,
		};
	}

	if (input.connectivity === 'offline') {
		return {
			queryKey: discovery.queryKey,
			action: 'skip-offline',
			reason: 'store connection is offline, so query-specific total discovery cannot contact Woo',
			totalMatchingRecords: null,
			request: null,
			cacheStatus: status,
		};
	}

	return {
		queryKey: discovery.queryKey,
		action: 'enqueue-total-request',
		reason:
			'filtered exact-limit query needs a fresh Woo total and no equivalent request is in flight',
		totalMatchingRecords: null,
		cacheStatus: status,
		request: {
			queryKey: discovery.queryKey,
			method: 'GET',
			endpoint: input.endpoint,
			params: requestParams(input.filters),
			totalHeader: 'X-WP-Total',
		},
	};
}
