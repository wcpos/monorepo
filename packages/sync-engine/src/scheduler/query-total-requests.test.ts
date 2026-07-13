// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { planQueryTotalRequest, type QueryTotalCacheEntry } from './query-total-requests';

import type { QueryTotalDiscoveryDecision } from './query-total-discovery';

const needsTotalDecision: QueryTotalDiscoveryDecision = {
	queryKey: 'orders:browser:status=processing:search=:limit=50',
	action: 'request-query-total',
	reason:
		'filtered exact-limit query needs a query-specific Woo total before expected ids are trusted',
	complete: false,
	shouldRequestQueryTotal: true,
	totalMatchingRecords: null,
};

const completeDecision: QueryTotalDiscoveryDecision = {
	queryKey: 'orders:browser:status=processing:search=abc:limit=50',
	action: 'record-complete-lane',
	reason: 'known matching total equals returned records',
	complete: true,
	shouldRequestQueryTotal: false,
	totalMatchingRecords: 12,
};

function cacheEntry(overrides: Partial<QueryTotalCacheEntry> = {}): QueryTotalCacheEntry {
	return {
		queryKey: needsTotalDecision.queryKey,
		totalMatchingRecords: 42,
		freshUntilMs: 2_000,
		updatedAtMs: 1_000,
		...overrides,
	};
}

describe('planQueryTotalRequest', () => {
	it('skips requests when discovery does not require a query-specific total', () => {
		const result = planQueryTotalRequest({
			discovery: completeDecision,
			connectivity: 'online',
			nowMs: 1_500,
			endpoint: '/wp-json/wc/v3/orders',
			filters: { status: 'processing' },
			cacheEntries: [],
			inFlightQueryKeys: [],
		});

		expect(result).toEqual({
			queryKey: completeDecision.queryKey,
			action: 'skip-not-needed',
			reason: 'query total discovery did not request a Woo total',
			totalMatchingRecords: null,
			request: null,
			cacheStatus: 'not-needed',
		});
	});

	it('uses a fresh cached query total instead of scheduling another request', () => {
		const result = planQueryTotalRequest({
			discovery: needsTotalDecision,
			connectivity: 'online',
			nowMs: 1_500,
			endpoint: '/wp-json/wc/v3/orders',
			filters: { status: 'processing' },
			cacheEntries: [cacheEntry()],
			inFlightQueryKeys: [],
		});

		expect(result.action).toBe('use-cached-total');
		expect(result.cacheStatus).toBe('fresh');
		expect(result.totalMatchingRecords).toBe(42);
		expect(result.request).toBeNull();
	});

	it('waits for an existing in-flight request for the same query key', () => {
		const result = planQueryTotalRequest({
			discovery: needsTotalDecision,
			connectivity: 'online',
			nowMs: 2_500,
			endpoint: '/wp-json/wc/v3/orders',
			filters: { status: 'processing' },
			cacheEntries: [cacheEntry({ freshUntilMs: 2_000 })],
			inFlightQueryKeys: [needsTotalDecision.queryKey],
		});

		expect(result.action).toBe('wait-for-in-flight');
		expect(result.cacheStatus).toBe('stale');
		expect(result.request).toBeNull();
	});

	it('does not schedule a remote query-total request while offline', () => {
		const result = planQueryTotalRequest({
			discovery: needsTotalDecision,
			connectivity: 'offline',
			nowMs: 1_500,
			endpoint: '/wp-json/wc/v3/orders',
			filters: { status: 'processing' },
			cacheEntries: [],
			inFlightQueryKeys: [],
		});

		expect(result).toEqual({
			queryKey: needsTotalDecision.queryKey,
			action: 'skip-offline',
			reason: 'store connection is offline, so query-specific total discovery cannot contact Woo',
			totalMatchingRecords: null,
			request: null,
			cacheStatus: 'missing',
		});
	});

	it('enqueues a minimal Woo REST list request when online without fresh cache or in-flight work', () => {
		const result = planQueryTotalRequest({
			discovery: needsTotalDecision,
			connectivity: 'online',
			nowMs: 2_500,
			endpoint: '/wp-json/wc/v3/orders',
			filters: { status: 'processing', search: '', customer: null, after: undefined },
			cacheEntries: [cacheEntry({ freshUntilMs: 2_000 })],
			inFlightQueryKeys: [],
		});

		expect(result).toEqual({
			queryKey: needsTotalDecision.queryKey,
			action: 'enqueue-total-request',
			reason:
				'filtered exact-limit query needs a fresh Woo total and no equivalent request is in flight',
			totalMatchingRecords: null,
			cacheStatus: 'stale',
			request: {
				queryKey: needsTotalDecision.queryKey,
				method: 'GET',
				endpoint: '/wp-json/wc/v3/orders',
				params: { status: 'processing', search: '', page: 1, per_page: 1 },
				totalHeader: 'X-WP-Total',
			},
		});
	});
});
