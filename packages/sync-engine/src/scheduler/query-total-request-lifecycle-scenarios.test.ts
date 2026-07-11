// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
	queryTotalRequestLifecycleScenarios,
	summarizeQueryTotalRequestLifecycleScenarios,
} from './query-total-request-lifecycle-scenarios';

describe('queryTotalRequestLifecycleScenarios', () => {
	it('covers active owner wait, expired owner takeover, and retry decisions', () => {
		const summaries = summarizeQueryTotalRequestLifecycleScenarios();

		expect(summaries).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					label: 'Fresh cache · use total',
					action: 'use-cached-total',
					ownerStatus: 'cache-hit',
				}),
				expect.objectContaining({
					label: 'Active owner · wait',
					action: 'wait-for-owner',
					ownerStatus: 'owned-by-other-tab',
				}),
				expect.objectContaining({
					label: 'Expired owner · take over',
					action: 'take-over-request',
					ownerStatus: 'expired-owner',
					nextAttempt: 2,
				}),
				expect.objectContaining({
					label: 'Retry backoff · wait',
					action: 'wait-for-retry',
					retryStatus: 'backoff-active',
				}),
				expect.objectContaining({
					label: 'Retry due · claim',
					action: 'claim-request',
					retryStatus: 'retry-ready',
					nextAttempt: 3,
				}),
				expect.objectContaining({
					label: 'Offline · skip claim',
					action: 'skip-offline',
					ownerStatus: 'not-claimed',
				}),
				expect.objectContaining({
					label: 'No state · claim',
					action: 'claim-request',
					ownerStatus: 'unowned',
					nextAttempt: 1,
				}),
			])
		);
	});

	it('summarizes request endpoints and params for claim/takeover scenarios', () => {
		const summaries = summarizeQueryTotalRequestLifecycleScenarios();
		const takeover = summaries.find((summary) => summary.label === 'Expired owner · take over');
		const claim = summaries.find((summary) => summary.label === 'Retry due · claim');

		expect(takeover?.requestEndpoint).toBe('GET /wp-json/wc/v3/orders');
		expect(takeover?.requestParams).toEqual({ status: 'processing', page: 1, per_page: 1 });
		expect(claim?.requestEndpoint).toBe('GET /wp-json/wc/v3/orders');
	});
});
