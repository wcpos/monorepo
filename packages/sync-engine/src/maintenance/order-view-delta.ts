import { checkpointInstantMs, type SyncObserver, type WooOrderPayload } from '@wcpos/sync-core';

import {
	ingestPulledOrderPayloads,
	type OrdersSchedulerFetcherInput,
	parseOrderBrowserSchedulerDescriptor,
	wooGmtDate,
} from '../scheduler';

// Bound the number of distinct open cashier/store scopes visited per tick.
export const ORDER_VIEW_DELTA_MAX_SCOPES = 4;
// Bound each scope's pass to three requests.
export const ORDER_VIEW_DELTA_MAX_PAGES = 3;
// Use one Woo REST page of modified orders per request.
export const ORDER_VIEW_DELTA_PER_PAGE = 100;
// Re-ask the last minute for out-of-order commits; equal revision stamps write nothing.
export const ORDER_VIEW_DELTA_OVERLAP_SECONDS = 60;
// A newly opened view asks for the browse window's five-minute freshness interval.
export const ORDER_VIEW_DELTA_FIRST_LOOKBACK_SECONDS = 300;

export type OrderIngestPort = Pick<
	OrdersSchedulerFetcherInput,
	'repository' | 'pendingMutationOrderIds' | 'discardHeldOpenCartRows'
>;

export async function tickOrderViewDelta(input: {
	baseUrl: string;
	fetcher: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
	ingest: () => OrderIngestPort;
	viewKeys: readonly string[];
	cursors: Map<string, number>;
	now: () => number;
	signal?: AbortSignal;
	diagnostics?: SyncObserver;
}): Promise<{ scopes: number; requests: number; documents: number; unsupported: boolean }> {
	const scopes = new Map<string, { cashierId?: number; store?: string }>();
	for (const key of input.viewKeys) {
		const decision = parseOrderBrowserSchedulerDescriptor(key);
		if (!decision?.descriptor || decision.skipReason || decision.descriptor.complete) continue;
		const { cashierId, store } = decision.descriptor;
		scopes.set(`cashier=${cashierId ?? ''}|store=${store ?? ''}`, decision.descriptor);
	}
	const result = { scopes: 0, requests: 0, documents: 0, unsupported: false };
	for (const [scopeKey, descriptor] of scopes) {
		if (result.scopes >= ORDER_VIEW_DELTA_MAX_SCOPES) break;
		result.scopes++;
		const cursor =
			input.cursors.get(scopeKey) ??
			Math.floor(input.now() / 1_000) - ORDER_VIEW_DELTA_FIRST_LOOKBACK_SECONDS;
		const bound = cursor - ORDER_VIEW_DELTA_OVERLAP_SECONDS;
		let latest = cursor;
		const query = new URLSearchParams({
			modified_after: wooGmtDate(bound),
			dates_are_gmt: 'true',
			orderby: 'modified',
			order: 'asc',
			per_page: String(ORDER_VIEW_DELTA_PER_PAGE),
		});
		if (descriptor.cashierId !== undefined) query.set('pos_cashier', String(descriptor.cashierId));
		if (descriptor.store !== undefined) {
			query.set(/^\d+$/.test(descriptor.store) ? 'pos_store' : 'created_via', descriptor.store);
		}
		for (let page = 1; page <= ORDER_VIEW_DELTA_MAX_PAGES; page++) {
			query.set('page', String(page));
			// Same wall clock as pullRequestedAt and the repository's adoption guard.
			const requestedAt = Date.now();
			const response = await input.fetcher(`${input.baseUrl}/orders?${query}`, {
				signal: input.signal,
			});
			result.requests++;
			if (!response.ok && response.status !== 400)
				throw new Error(`order-view-delta: HTTP ${response.status}`);
			const payloads: WooOrderPayload[] = response.status === 400 ? [] : await response.json();
			const modified = payloads.map((payload) =>
				Math.floor(checkpointInstantMs(payload.date_modified_gmt) / 1_000)
			);
			const reason =
				response.status === 400
					? 'status-400'
					: modified.some((seconds) => seconds < bound)
						? 'modified-after-ignored'
						: null;
			if (reason) {
				result.unsupported = true;
				input.diagnostics?.({
					type: 'engine.guard',
					level: 'warn',
					collection: 'orders',
					message: 'order-view-delta: store does not honour modified_after/orderby=modified',
					fields: { lane: 'order-view-delta', reason },
				});
				break;
			}
			result.documents += await ingestPulledOrderPayloads(input.ingest(), payloads, requestedAt);
			latest = Math.max(latest, ...modified);
			if (payloads.length < ORDER_VIEW_DELTA_PER_PAGE) break;
		}
		if (result.unsupported) break;
		input.cursors.set(scopeKey, latest);
	}
	for (const key of input.cursors.keys()) if (!scopes.has(key)) input.cursors.delete(key);
	return result;
}
