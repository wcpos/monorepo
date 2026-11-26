import { describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness, type EngineHarnessRequest } from './testing';

setPremiumFlag();

const row = (id: number) => ({
	id,
	parent_id: 42,
	date_created_gmt: '2026-09-01T00:00:00',
	amount: '20.0000',
	reason: '',
	meta_data: [{ key: '_wcpos_session', value: 'B' }],
});

const routes = {
	'/refunds': ({ url }: EngineHarnessRequest) => {
		const page = Number(new URL(url).searchParams.get('page'));
		const rows = Array.from({ length: 100 }, (_, index) => row((page - 1) * 100 + index + 1));
		return Response.json(rows, { headers: { 'X-WP-TotalPages': '21' } });
	},
	'/orders': [],
	'/products': [],
};
const startAtMs = Date.parse('2026-09-16T00:00:00Z');

const filteredProducts = {
	id: 'filtered-products',
	collection: 'products' as const,
	kind: 'product-browse' as const,
	category: [7],
	limit: 10,
};
const refundRefresh = {
	id: 'refund-history-refresh',
	collection: 'refunds',
	kind: 'refresh',
	forceRefresh: true,
} as const;

const isCategoryBrowse = ({ path, url }: EngineHarnessRequest) =>
	path.endsWith('/products') && new URL(url).searchParams.get('category') === '7';
const isRefund = ({ path }: EngineHarnessRequest) => path.endsWith('/refunds');
const pageOf = ({ url }: EngineHarnessRequest) => Number(new URL(url).searchParams.get('page'));

describe('the refund history walk yields the require lane to browse windows', () => {
	it('a filtered product window is not held behind a 21-page refund history walk', async () => {
		const harness = await createEngineHarness({ routes, startAtMs });
		try {
			const { engine } = harness;
			await engine.sync('reference-seed');
			const orders = engine.require({
				id: 'orders-before-products',
				collection: 'orders',
				kind: 'orders-browse',
				status: 'processing',
				limit: 25,
			});
			const products = engine.require(filteredProducts);
			await Promise.all([orders.ready, products.ready]);
			orders.release();
			products.release();

			const browseIndex = harness.requests.findIndex(isCategoryBrowse);
			expect(browseIndex).toBeGreaterThanOrEqual(0);
			expect(harness.requests.slice(0, browseIndex).filter(isRefund)).toHaveLength(0);

			await engine.sync('scheduler-drain');
			expect(harness.requests.filter(isRefund).map(pageOf)).toContain(21);
		} finally {
			await harness.dispose();
		}
	}, 30_000);

	it('a refund history refresh does not hold a browse window declared after it', async () => {
		const harness = await createEngineHarness({ routes, startAtMs });
		try {
			const { engine } = harness;
			const refresh = engine.require(refundRefresh);
			const products = engine.require(filteredProducts);
			await Promise.all([refresh.ready, products.ready]);
			refresh.release();
			products.release();

			const browseIndex = harness.requests.findIndex(isCategoryBrowse);
			const lastPageIndex = harness.requests.findIndex(
				(request) => isRefund(request) && pageOf(request) === 21
			);
			expect(browseIndex).toBeGreaterThanOrEqual(0);
			expect(browseIndex).toBeLessThan(lastPageIndex);
		} finally {
			await harness.dispose();
		}
	}, 30_000);

	it('an explicit refund history refresh still walks every page', async () => {
		const harness = await createEngineHarness({ routes, startAtMs });
		try {
			const refresh = harness.engine.require(refundRefresh);
			await refresh.ready;
			refresh.release();

			expect(harness.requests.filter(isRefund).map(pageOf)).toEqual(
				Array.from({ length: 21 }, (_, index) => index + 1)
			);
		} finally {
			await harness.dispose();
		}
	}, 30_000);
});
