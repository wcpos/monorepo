import { describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness, remoteId } from './testing';

describe('resident order refresh outcomes', () => {
	it.each([
		{
			name: 'rejects ready when a forced refresh of a resident order has an owned failed task',
			forceRefresh: true,
			pullFails: true,
			action: null,
		},
		{
			name: 'fetches a resident order when its forced refresh task succeeds',
			forceRefresh: true,
			pullFails: false,
			action: 'fetched',
		},
		{
			name: 'serves a resident order locally without a pull when refresh is not forced',
			forceRefresh: false,
			pullFails: true,
			action: 'serve-local',
		},
	])('$name', async ({ forceRefresh, pullFails, action }) => {
		setPremiumFlag();
		let failPull = false;
		let pulls = 0;
		const harness = await createEngineHarness({
			fetch: async (url) => {
				if (!new URL(url).pathname.endsWith('/orders')) {
					throw new Error(`Unexpected request: ${url}`);
				}
				pulls += 1;
				if (failPull) return new Response('Service unavailable', { status: 503 });
				return Response.json([
					{
						id: 7,
						status: 'processing',
						total: '5.00',
						date_modified_gmt: '2026-07-10T00:00:01',
						meta_data: [
							{
								key: '_woocommerce_pos_uuid',
								value: '77777777-7777-4777-8777-777777777777',
							},
						],
					},
				]);
			},
		});
		try {
			await harness.engine.ready;
			const requirement = {
				id: 'resident-order',
				collection: 'orders' as const,
				kind: 'targeted-records' as const,
				remoteIds: [remoteId(7)],
			};
			await harness.engine.require(requirement).ready;
			expect(await harness.collection('orders').count().exec()).toBe(1);
			const pullsBefore = pulls;
			failPull = pullFails;
			const handle = harness.engine.require({ ...requirement, forceRefresh });
			try {
				if (action === null) {
					await expect(handle.ready).rejects.toThrow(
						'require: forced refresh failed 1 task(s) for 1 resident order(s)'
					);
				} else {
					await expect(handle.ready).resolves.toMatchObject({ action });
				}
				expect(pulls - pullsBefore).toBe(forceRefresh ? 1 : 0);
				expect(await harness.collection('orders').count().exec()).toBe(1);
			} finally {
				handle.release();
			}
		} finally {
			await harness.dispose();
		}
	});
});
