import { describe, expect, it } from 'vitest';
import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

import { createEngineHarness } from './testing';

setPremiumFlag();

describe('idle reference refresh cadence', () => {
	it('rechecks an empty collection after the short backfill window', async () => {
		let available = false;
		const harness = await createEngineHarness({
			startAtMs: 1_000_000,
			routes: {
				'/coupons': () =>
					available
						? [
								{
									id: 1,
									code: 'new-coupon',
									meta_data: [
										{
											key: '_woocommerce_pos_uuid',
											value: '55555555-5555-4555-8555-555555555555',
										},
									],
								},
							]
						: [],
			},
		});
		try {
			const { engine, clock } = harness;
			await harness.collection('queryTotalCacheEntries').upsert({
				queryKey: 'census:coupons',
				totalMatchingRecords: 1,
				updatedAtMs: clock.now(),
				freshUntilMs: clock.now() + 60 * 60_000,
				schemaVersion: 1,
			});
			await engine.sync('reference-seed');
			await engine.sync('scheduler-drain');
			expect(await harness.collection('coupons').count().exec()).toBe(0);
			available = true;
			clock.advance(3 * 60_000);
			await engine.sync('reference-seed');
			await engine.sync('scheduler-drain');
			expect(harness.requests.filter(({ path }) => path.endsWith('/coupons'))).toHaveLength(1);
			clock.advance(60_000 + 1);
			await engine.sync('reference-seed');
			await engine.sync('scheduler-drain');
			expect(harness.requests.filter(({ path }) => path.endsWith('/coupons'))).toHaveLength(2);
			expect(await harness.collection('coupons').count().exec()).toBe(1);
		} finally {
			await harness.dispose();
		}
	});

	it.each(['categories', 'brands', 'tags', 'coupons'] as const)(
		'%s does not download the unchanged collection every five minutes',
		async (collection) => {
			const endpoint = collection === 'coupons' ? '/coupons' : `/products/${collection}`;
			const rows = Array.from({ length: 250 }, (_, index) => ({
				id: index + 1,
				name: `Reference ${index + 1}`,
				code: `coupon-${index + 1}`,
				description: 'Searchable coupon description',
				meta_data: [
					{
						key: '_woocommerce_pos_uuid',
						value: `55555555-5555-4555-8555-${String(index + 1).padStart(12, '0')}`,
					},
				],
			}));
			const harness = await createEngineHarness({
				startAtMs: 1_000_000,
				routes: {
					[endpoint]: ({ url }: { url: string }) => {
						const params = new URL(url).searchParams;
						const include = params.get('include');
						if (include) return rows.filter(({ id }) => include.split(',').includes(String(id)));
						const page = Number(params.get('page'));
						const size = Number(params.get('per_page'));
						return rows.slice((page - 1) * size, page * size);
					},
				},
			});
			try {
				const { engine, clock } = harness;
				engine.reconfigure({ pullBatchSize: 100 });
				await harness.collection('queryTotalCacheEntries').upsert({
					queryKey: `census:${collection}`,
					totalMatchingRecords: 250,
					updatedAtMs: clock.now(),
					freshUntilMs: clock.now() + 60_000,
					schemaVersion: 1,
				});
				await engine.sync('reference-seed');
				await engine.sync('scheduler-drain');
				expect(await harness.collection(collection).count().exec()).toBe(250);
				const pulls = () => harness.requests.filter(({ path }) => path.endsWith(endpoint)).length;
				expect(pulls()).toBe(3);
				let updates = 0;
				const subscription = harness.collection(collection).update$.subscribe(() => {
					updates += 1;
				});
				try {
					for (let minute = 5; minute <= 25; minute += 5) {
						clock.advance(5 * 60_000);
						await engine.sync('reference-seed');
						await engine.sync('scheduler-drain');
					}
					// Measures both suspected costs: HTTP pages and actual RxDB row updates.
					expect({ requests: pulls(), updates }).toEqual({ requests: 3, updates: 0 });
					// No change signal: the safety pull must still discover edits and deletions.
					rows[0]!.description = 'Updated searchable description';
					rows.pop();
					clock.advance(10 * 60_000);
					await engine.sync('reference-seed');
					await engine.sync('scheduler-drain');
					// Name-sorted taxonomies verify the missing ID before pruning; coupons use ID order.
					const safetyRequests = collection === 'coupons' ? 6 : 7;
					expect({ requests: pulls(), updates }).toEqual({ requests: safetyRequests, updates: 1 });
					expect(await harness.collection(collection).count().exec()).toBe(249);
					expect(
						(
							await harness.collection(collection).findOne(rows[0]!.meta_data[0]!.value).exec()
						)?.toJSON()
					).toMatchObject({
						payload: { description: 'Updated searchable description' },
					});
					clock.advance(5 * 60_000);
					await engine.sync('reference-seed');
					await engine.sync('scheduler-drain');
					expect(pulls()).toBe(safetyRequests);
				} finally {
					subscription.unsubscribe();
				}
			} finally {
				await harness.dispose();
			}
		}
	);
});
