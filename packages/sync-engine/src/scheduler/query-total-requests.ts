/**
 * Query-total POLICY WINDOWS — one home, imported by every consumer (the
 * request runner, the mount kit's durable retry scan, and the host), so the
 * lease/retry/freshness discipline can't drift between them.
 */
export const QUERY_TOTAL_LEASE_FOR_MS = 30 * 1_000;
export const QUERY_TOTAL_RETRY_AFTER_MS = 30 * 1_000;
export const QUERY_TOTAL_FRESH_FOR_MS = 5 * 60 * 1_000;

export type QueryTotalCacheEntry = {
	queryKey: string;
	totalMatchingRecords: number;
	freshUntilMs: number;
	updatedAtMs: number;
};

export type QueryTotalObservation = {
	queryKeys: readonly string[];
	totalMatchingRecords: number;
};

export type CacheQueryTotals = (observation: QueryTotalObservation) => Promise<void>;

export function queryTotalFromResponse(response: Pick<Response, 'headers'>): number | null {
	try {
		const rawTotal = response.headers.get('X-WP-Total');
		if (rawTotal === null || rawTotal.trim() === '') return null;
		const total = Number(rawTotal);
		return Number.isSafeInteger(total) && total >= 0 ? total : null;
	} catch {
		return null;
	}
}

export type QueryTotalRequestParams = Record<string, string | number | boolean>;

export type QueryTotalWooRequest = {
	queryKey: string;
	method: 'GET';
	endpoint: string;
	params: QueryTotalRequestParams;
	totalHeader: 'X-WP-Total';
};
