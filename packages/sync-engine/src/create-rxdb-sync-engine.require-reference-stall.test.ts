import { describe, expect, it, vi } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { seedTaxRatesLane } from './scheduler/rx-pos-bootstrap-seeder';
import { createEngineHarness, type EngineHarnessRequest } from './testing';

setPremiumFlag();

const coupons = Array.from({ length: 3_000 }, (_, index) => ({
	id: index + 1,
	code: `coupon-${index + 1}`,
	meta_data: [
		{
			key: '_woocommerce_pos_uuid',
			value: `55555555-5555-4555-8555-${String(index + 1).padStart(12, '0')}`,
		},
	],
}));

function couponPage({ url }: EngineHarnessRequest): Response {
	const params = new URL(url).searchParams;
	const page = Number(params.get('page'));
	const size = Number(params.get('per_page'));
	return Response.json(coupons.slice((page - 1) * size, page * size), {
		headers: {
			'X-WP-Total': String(coupons.length),
			'X-WP-TotalPages': String(Math.ceil(coupons.length / size)),
		},
	});
}

const isCategoryBrowse = ({ path, url }: EngineHarnessRequest) =>
	path.endsWith('/products') && new URL(url).searchParams.has('category');

describe('reference walks yield the require lane to browse windows', () => {
	it('a filtered product window is not held behind a 3,000-coupon re-pull', async () => {
		const harness = await createEngineHarness({
			startAtMs: 1_000_000,
			routes: { '/coupons': couponPage, '/orders': [], '/products': [] },
		});
		try {
			const { engine, clock } = harness;
			engine.reconfigure({ pullBatchSize: 100 });
			await harness.collection('queryTotalCacheEntries').upsert({
				queryKey: 'census:coupons',
				totalMatchingRecords: 3_000,
				updatedAtMs: clock.now(),
				freshUntilMs: clock.now() + 60_000,
				schemaVersion: 1,
			});
			await engine.sync('reference-seed');

			const orders = engine.require({
				id: 'orders-before-products',
				collection: 'orders',
				kind: 'orders-browse',
				status: 'processing',
				limit: 25,
			});
			const products = engine.require({
				id: 'filtered-products',
				collection: 'products',
				kind: 'product-browse',
				category: [7],
				limit: 10,
			});
			await Promise.all([orders.ready, products.ready]);
			orders.release();
			products.release();

			const browseIndex = harness.requests.findIndex(isCategoryBrowse);
			expect(browseIndex).toBeGreaterThanOrEqual(0);
			expect(
				harness.requests.slice(0, browseIndex).filter(({ path }) => path.endsWith('/coupons'))
			).toHaveLength(0);

			await engine.sync('scheduler-drain');
			expect(await harness.collection('coupons').count().exec()).toBe(3_000);
		} finally {
			await harness.dispose();
		}
	});

	it('a coupons refresh does not hold a browse window queued after it', async () => {
		const gate = Promise.withResolvers<void>();
		const harness = await createEngineHarness({
			routes: {
				'/coupons': async (request: EngineHarnessRequest) => {
					if (new URL(request.url).searchParams.get('page') === '2') await gate.promise;
					return couponPage(request);
				},
				'/orders': [],
				'/products': [],
			},
		});
		try {
			const { engine } = harness;
			engine.reconfigure({ pullBatchSize: 100 });
			const refresh = engine.require({
				id: 'coupons-refresh',
				collection: 'coupons',
				kind: 'refresh',
			});
			await vi.waitFor(() =>
				expect(
					harness.requests.some(
						({ path, url }) =>
							path.endsWith('/coupons') && new URL(url).searchParams.get('page') === '2'
					)
				).toBe(true)
			);
			const products = engine.require({
				id: 'browse-during-coupons-refresh',
				collection: 'products',
				kind: 'product-browse',
				category: [7],
				limit: 10,
			});
			try {
				// Page 2 stays held until this assertion finishes: browse must progress alongside it.
				await vi.waitFor(() => expect(harness.requests.some(isCategoryBrowse)).toBe(true));
			} finally {
				gate.resolve();
				await Promise.all([refresh.ready, products.ready]);
				refresh.release();
				products.release();
			}
			expect(await harness.collection('coupons').count().exec()).toBe(3_000);
		} finally {
			gate.resolve();
			await harness.dispose();
		}
	});

	it('an orders drain still drains non-reference work', async () => {
		const harness = await createEngineHarness({
			startAtMs: 1_000_000,
			routes: {
				'/coupons': couponPage,
				'/orders': [],
				'/products': [],
				'/taxes': Array.from({ length: 7 }, (_, index) => ({
					id: index + 1,
					country: 'GB',
					rate: '20.0000',
					name: 'VAT',
				})),
			},
		});
		try {
			const { engine, clock } = harness;
			engine.reconfigure({ pullBatchSize: 100 });
			await harness.collection('queryTotalCacheEntries').upsert({
				queryKey: 'census:coupons',
				totalMatchingRecords: 3_000,
				updatedAtMs: clock.now(),
				freshUntilMs: clock.now() + 60_000,
				schemaVersion: 1,
			});
			await engine.sync('reference-seed');
			const scope = engine.active();
			if (!scope) throw new Error('no active scope');
			await seedTaxRatesLane({ database: scope.database as never, nowMs: clock.now() });

			const products = engine.require({
				id: 'products-beside-tax-rates',
				collection: 'products',
				kind: 'product-browse',
				limit: 10,
			});
			await products.ready;
			products.release();
			expect(await harness.collection('taxRates').count().exec()).toBe(7);
			expect(harness.requests.some(({ path }) => path.endsWith('/taxes'))).toBe(true);
			expect(harness.requests.filter(({ path }) => path.endsWith('/coupons'))).toHaveLength(0);
		} finally {
			await harness.dispose();
		}
	});
});
