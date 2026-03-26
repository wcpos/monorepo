/**
 * Performance: Time To First Result (TTFR) benchmarks.
 *
 * Measures how long it takes for a Query's result$ to emit its first value
 * under different conditions:
 *
 * 1. Empty DB, no sync running (baseline)
 * 2. Pre-populated DB, no sync running (subsequent visit baseline)
 * 3. Empty DB with concurrent processFullAudit (first-sync scenario)
 * 4. Pre-populated DB with concurrent processFullAudit (subsequent visit + sync)
 * 5. Pre-populated DB with concurrent bulkInsert (simulating active data writes)
 *
 * These benchmarks quantify the two bottlenecks described in issue #247:
 * - UI thread blocked by sync JS
 * - Table waits for first batch before rendering
 */
import { firstValueFrom, race, timer } from 'rxjs';
import { map } from 'rxjs/operators';

import { httpClientMock } from './__mocks__/http';
import { createStoreDatabase, createSyncDatabase } from './helpers/db';
import { Query } from '../src/query-state';
import { SyncStateManager } from '../src/sync-state';

import type { RxDatabase } from 'rxdb';

jest.setTimeout(60000);

/**
 * Generate mock product documents for insertion
 */
function generateProducts(count: number, startId = 1) {
	return Array.from({ length: count }, (_, i) => ({
		id: startId + i,
		uuid: `uuid-${startId + i}`,
		name: `Product ${startId + i}`,
		date_modified_gmt: '2024-01-01T00:00:00',
	}));
}

/**
 * Generate mock server records (lightweight — just id + date)
 */
function generateServerRecords(count: number) {
	return Array.from({ length: count }, (_, i) => ({
		id: i + 1,
		date_modified_gmt: '2024-01-01T00:00:00',
	}));
}

/**
 * Measure time to first emission from a Query's result$.
 * Returns the duration in ms and the result.
 */
async function measureTTFR(
	collection: any,
	timeout = 10000
): Promise<{ durationMs: number; hitCount: number }> {
	const start = performance.now();

	const query = new Query({
		id: `ttfr-${Date.now()}-${Math.random()}`,
		collection,
		initialParams: {},
		locale: 'en',
	});

	try {
		const result = await firstValueFrom(
			race(
				query.result$,
				timer(timeout).pipe(
					map(() => {
						throw new Error(`TTFR timed out after ${timeout}ms`);
					})
				)
			)
		);

		const durationMs = performance.now() - start;
		return { durationMs, hitCount: result.hits.length };
	} finally {
		await query.cancel();
	}
}

describe('Performance: Time To First Result (TTFR)', () => {
	let storeDatabase: RxDatabase;
	let syncDatabase: RxDatabase;

	beforeEach(async () => {
		storeDatabase = await createStoreDatabase();
		syncDatabase = await createSyncDatabase();
		httpClientMock.__resetMockResponses();
	});

	afterEach(async () => {
		if (storeDatabase && !storeDatabase.destroyed) {
			await storeDatabase.remove();
		}
		if (syncDatabase && !syncDatabase.destroyed) {
			await syncDatabase.remove();
		}
	});

	describe('Baseline: No concurrent sync', () => {
		it('TTFR on empty collection (first-visit, no data)', async () => {
			const { durationMs, hitCount } = await measureTTFR(storeDatabase.collections.products);

			console.log(`TTFR (empty DB, no sync): ${durationMs.toFixed(1)}ms — ${hitCount} hits`);
			expect(hitCount).toBe(0);
			// Should be nearly instant — just an empty RxDB query
			expect(durationMs).toBeLessThan(500);
		});

		it('TTFR with 100 local records (subsequent visit)', async () => {
			await storeDatabase.collections.products.bulkInsert(generateProducts(100));

			const { durationMs, hitCount } = await measureTTFR(storeDatabase.collections.products);

			console.log(
				`TTFR (100 local records, no sync): ${durationMs.toFixed(1)}ms — ${hitCount} hits`
			);
			expect(hitCount).toBe(100);
			expect(durationMs).toBeLessThan(1000);
		});

		it('TTFR with 1000 local records (subsequent visit, larger dataset)', async () => {
			await storeDatabase.collections.products.bulkInsert(generateProducts(1000));

			const { durationMs, hitCount } = await measureTTFR(storeDatabase.collections.products);

			console.log(
				`TTFR (1000 local records, no sync): ${durationMs.toFixed(1)}ms — ${hitCount} hits`
			);
			expect(hitCount).toBe(1000);
			expect(durationMs).toBeLessThan(2000);
		});

		it('TTFR with 5000 local records', async () => {
			await storeDatabase.collections.products.bulkInsert(generateProducts(5000));

			const { durationMs, hitCount } = await measureTTFR(storeDatabase.collections.products);

			console.log(
				`TTFR (5000 local records, no sync): ${durationMs.toFixed(1)}ms — ${hitCount} hits`
			);
			expect(hitCount).toBe(5000);
			expect(durationMs).toBeLessThan(5000);
		});
	});

	describe('With concurrent processFullAudit (first-sync scenario)', () => {
		it('TTFR while processFullAudit runs on 10k server records (empty local DB)', async () => {
			const syncStateManager = new SyncStateManager({
				collection: storeDatabase.collections.products,
				syncCollection: syncDatabase.collections.products,
				endpoint: 'products',
			});

			// Start the audit — don't await it
			const auditPromise = syncStateManager.processFullAudit(generateServerRecords(10000));

			// Immediately measure TTFR — this simulates the user opening the page
			// while the first sync audit is running
			const { durationMs, hitCount } = await measureTTFR(storeDatabase.collections.products);

			console.log(
				`TTFR (empty DB + 10k audit running): ${durationMs.toFixed(1)}ms — ${hitCount} hits`
			);

			// The query should still return quickly with 0 results
			// even though the audit is running in the background
			expect(hitCount).toBe(0);
			expect(durationMs).toBeLessThan(1000);

			// Wait for audit to complete to avoid dangling promises
			await auditPromise;
		});

		it('TTFR while processFullAudit runs on 50k server records (empty local DB)', async () => {
			const syncStateManager = new SyncStateManager({
				collection: storeDatabase.collections.products,
				syncCollection: syncDatabase.collections.products,
				endpoint: 'products',
			});

			const auditPromise = syncStateManager.processFullAudit(generateServerRecords(50000));

			const { durationMs, hitCount } = await measureTTFR(storeDatabase.collections.products);

			console.log(
				`TTFR (empty DB + 50k audit running): ${durationMs.toFixed(1)}ms — ${hitCount} hits`
			);

			expect(hitCount).toBe(0);
			expect(durationMs).toBeLessThan(2000);

			await auditPromise;
		});
	});

	describe('With concurrent processFullAudit (subsequent visit scenario)', () => {
		it('TTFR with 1000 local records while 10k audit runs', async () => {
			// Pre-populate the DB (simulating existing local data)
			await storeDatabase.collections.products.bulkInsert(generateProducts(1000));

			const syncStateManager = new SyncStateManager({
				collection: storeDatabase.collections.products,
				syncCollection: syncDatabase.collections.products,
				endpoint: 'products',
			});

			// Start audit with overlapping records
			const auditPromise = syncStateManager.processFullAudit(generateServerRecords(10000));

			const { durationMs, hitCount } = await measureTTFR(storeDatabase.collections.products);

			console.log(
				`TTFR (1k local + 10k audit running): ${durationMs.toFixed(1)}ms — ${hitCount} hits`
			);

			expect(hitCount).toBe(1000);
			expect(durationMs).toBeLessThan(2000);

			await auditPromise;
		});

		it('TTFR with 5000 local records while 50k audit runs', async () => {
			await storeDatabase.collections.products.bulkInsert(generateProducts(5000));

			const syncStateManager = new SyncStateManager({
				collection: storeDatabase.collections.products,
				syncCollection: syncDatabase.collections.products,
				endpoint: 'products',
			});

			const auditPromise = syncStateManager.processFullAudit(generateServerRecords(50000));

			const { durationMs, hitCount } = await measureTTFR(storeDatabase.collections.products);

			console.log(
				`TTFR (5k local + 50k audit running): ${durationMs.toFixed(1)}ms — ${hitCount} hits`
			);

			expect(hitCount).toBe(5000);
			expect(durationMs).toBeLessThan(5000);

			await auditPromise;
		});
	});

	describe('With concurrent bulkInsert (simulating active data writes during sync)', () => {
		it('TTFR while bulkInsert of 1000 records is running', async () => {
			// Start a large insert — simulates processServerResponse writing data
			const insertPromise = storeDatabase.collections.products.bulkInsert(generateProducts(1000));

			const { durationMs, hitCount } = await measureTTFR(storeDatabase.collections.products);

			console.log(`TTFR (concurrent 1k bulkInsert): ${durationMs.toFixed(1)}ms — ${hitCount} hits`);

			// We may or may not see the inserted records depending on timing
			expect(durationMs).toBeLessThan(2000);

			await insertPromise;
		});

		it('TTFR while multiple sequential bulkInserts are running', async () => {
			// Simulate the sync loop doing multiple batches of writes
			const writeLoop = async () => {
				for (let batch = 0; batch < 5; batch++) {
					await storeDatabase.collections.products.bulkInsert(
						generateProducts(200, batch * 200 + 1)
					);
				}
			};

			const writePromise = writeLoop();

			const { durationMs, hitCount } = await measureTTFR(storeDatabase.collections.products);

			console.log(
				`TTFR (concurrent 5x200 bulkInserts): ${durationMs.toFixed(1)}ms — ${hitCount} hits`
			);

			expect(durationMs).toBeLessThan(2000);

			await writePromise;
		});
	});

	describe('Event loop responsiveness during sync', () => {
		it('measures event loop delay during processFullAudit', async () => {
			const syncStateManager = new SyncStateManager({
				collection: storeDatabase.collections.products,
				syncCollection: syncDatabase.collections.products,
				endpoint: 'products',
			});

			const delays: number[] = [];
			let measuring = true;

			// Continuously measure event loop delay
			const measureLoop = async () => {
				while (measuring) {
					const start = performance.now();
					await new Promise((resolve) => setTimeout(resolve, 0));
					const delay = performance.now() - start;
					delays.push(delay);
				}
			};

			const measurePromise = measureLoop();
			await syncStateManager.processFullAudit(generateServerRecords(10000));
			measuring = false;
			await measurePromise;

			const maxDelay = Math.max(...delays);
			const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
			const sorted = [...delays].sort((a, b) => a - b);
			const p95Delay = sorted[Math.floor(sorted.length * 0.95)];

			console.log(`Event loop delays during 10k audit:`);
			console.log(`  Samples: ${delays.length}`);
			console.log(`  Avg: ${avgDelay.toFixed(1)}ms`);
			console.log(`  P95: ${p95Delay.toFixed(1)}ms`);
			console.log(`  Max: ${maxDelay.toFixed(1)}ms`);

			// P95 should be under 100ms for reasonable UI responsiveness
			// (16ms = 60fps frame budget, but 100ms is the threshold for perceived lag)
			expect(p95Delay).toBeLessThan(100);
		});
	});
});
