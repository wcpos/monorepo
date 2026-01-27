/**
 * Performance tests for large datasets.
 *
 * These tests verify that operations complete in reasonable time
 * and don't block the event loop excessively.
 *
 * Dataset sizes are chosen to be meaningful but CI-friendly:
 * - 10k records: ~2-5 seconds
 * - 50k records: ~10-20 seconds
 */
import { Subject } from 'rxjs';

import { httpClientMock } from './__mocks__/http';
import { createStoreDatabase, createSyncDatabase } from './helpers/db';
import { SyncStateManager } from '../src/sync-state';
import { Manager } from '../src/manager';
import { swapCollection } from '../src/collection-swap';
import { processInChunks, yieldToEventLoop } from '../src/yield';

import type { RxDatabase } from 'rxdb';

// Increase timeout for performance tests
jest.setTimeout(60000);

/**
 * Generate mock server records
 */
function generateServerRecords(count: number) {
	return Array.from({ length: count }, (_, i) => ({
		id: i + 1,
		date_modified_gmt: '2024-01-01T00:00:00',
	}));
}

/**
 * Generate mock product documents for insertion
 */
function generateProducts(count: number) {
	return Array.from({ length: count }, (_, i) => ({
		id: i + 1,
		uuid: `uuid-${i + 1}`,
		name: `Product ${i + 1}`,
		date_modified_gmt: '2024-01-01T00:00:00',
	}));
}

describe('Performance', () => {
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

	describe('SyncStateManager.processFullAudit', () => {
		it('processes 10k server records in under 10 seconds', async () => {
			const recordCount = 10000;
			const serverRecords = generateServerRecords(recordCount);

			const syncStateManager = new SyncStateManager({
				collection: storeDatabase.collections.products,
				syncCollection: syncDatabase.collections.products,
				endpoint: 'products',
			});

			const startTime = performance.now();
			await syncStateManager.processFullAudit(serverRecords);
			const duration = performance.now() - startTime;

			// Verify all records were processed
			const syncDocs = await syncDatabase.collections.products.find().exec();
			expect(syncDocs.length).toBe(recordCount);

			// Should complete in reasonable time
			expect(duration).toBeLessThan(10000);
			console.log(`processFullAudit(${recordCount}): ${duration.toFixed(0)}ms`);
		});

		it('processes 50k server records in under 30 seconds', async () => {
			const recordCount = 50000;
			const serverRecords = generateServerRecords(recordCount);

			const syncStateManager = new SyncStateManager({
				collection: storeDatabase.collections.products,
				syncCollection: syncDatabase.collections.products,
				endpoint: 'products',
			});

			const startTime = performance.now();
			await syncStateManager.processFullAudit(serverRecords);
			const duration = performance.now() - startTime;

			// Verify all records were processed
			const syncDocs = await syncDatabase.collections.products.find().exec();
			expect(syncDocs.length).toBe(recordCount);

			// Should complete in reasonable time
			expect(duration).toBeLessThan(30000);
			console.log(`processFullAudit(${recordCount}): ${duration.toFixed(0)}ms`);
		});

		it('yields to event loop during processing (UI responsiveness)', async () => {
			const recordCount = 10000;
			const serverRecords = generateServerRecords(recordCount);

			const syncStateManager = new SyncStateManager({
				collection: storeDatabase.collections.products,
				syncCollection: syncDatabase.collections.products,
				endpoint: 'products',
			});

			let yieldCount = 0;
			const originalYield = global.setTimeout;

			// Count how many times we yield (setTimeout/setImmediate calls)
			const timeoutSpy = jest.spyOn(global, 'setTimeout');

			await syncStateManager.processFullAudit(serverRecords);

			// Should have yielded multiple times (once per batch)
			// With 10k records and 1000 batch size, expect ~10 yields
			const yieldCalls = timeoutSpy.mock.calls.filter(
				(call) => call[1] === 0 || call[1] === undefined
			);
			expect(yieldCalls.length).toBeGreaterThan(5);

			timeoutSpy.mockRestore();
		});
	});

	describe('Collection operations', () => {
		it('bulkInsert 10k records in under 10 seconds', async () => {
			const recordCount = 10000;
			const products = generateProducts(recordCount);

			const startTime = performance.now();
			await storeDatabase.collections.products.bulkInsert(products);
			const duration = performance.now() - startTime;

			const docs = await storeDatabase.collections.products.find().exec();
			expect(docs.length).toBe(recordCount);

			expect(duration).toBeLessThan(10000);
			console.log(`bulkInsert(${recordCount}): ${duration.toFixed(0)}ms`);
		});

		it('collection.remove() completes quickly for large datasets', async () => {
			// Note: In real-world IndexedDB/SQLite, collection.remove() is MUCH faster
			// than deleteAll() because it drops the collection rather than deleting
			// records one-by-one. In-memory storage doesn't show this difference.

			const recordCount = 5000;
			const products = generateProducts(recordCount);
			await storeDatabase.collections.products.bulkInsert(products);

			// Verify records exist
			const beforeDocs = await storeDatabase.collections.products.find().exec();
			expect(beforeDocs.length).toBe(recordCount);

			const startTime = performance.now();
			await storeDatabase.collections.products.remove();
			const duration = performance.now() - startTime;

			console.log(`collection.remove(${recordCount}): ${duration.toFixed(0)}ms`);

			// Should complete quickly (under 1 second even for 5k records)
			expect(duration).toBeLessThan(1000);
		});
	});

	describe('Yield utilities', () => {
		it('processInChunks handles 50k items without memory issues', async () => {
			const itemCount = 50000;
			const items = Array.from({ length: itemCount }, (_, i) => i);
			let processedCount = 0;

			const startTime = performance.now();
			await processInChunks(
				items,
				async (chunk) => {
					processedCount += chunk.length;
					// Simulate some work
					await new Promise((resolve) => setTimeout(resolve, 1));
				},
				5000 // 5k per chunk = 10 chunks
			);
			const duration = performance.now() - startTime;

			expect(processedCount).toBe(itemCount);
			// 10 chunks * ~1ms work + yields = should be under 1 second
			expect(duration).toBeLessThan(1000);
			console.log(`processInChunks(${itemCount}): ${duration.toFixed(0)}ms`);
		});

		it('maintains UI responsiveness during heavy processing', async () => {
			const itemCount = 10000;
			const items = Array.from({ length: itemCount }, (_, i) => i);

			// Track when "UI updates" would happen
			const uiUpdates: number[] = [];
			let processingComplete = false;

			// Start processing
			const processingPromise = processInChunks(
				items,
				async () => {
					// Simulate CPU-bound work
					let sum = 0;
					for (let i = 0; i < 1000; i++) sum += i;
				},
				1000
			).then(() => {
				processingComplete = true;
			});

			// Schedule "UI updates" during processing
			const scheduleUIUpdate = () => {
				if (!processingComplete) {
					uiUpdates.push(performance.now());
					setTimeout(scheduleUIUpdate, 10);
				}
			};
			setTimeout(scheduleUIUpdate, 10);

			await processingPromise;

			// Should have had multiple UI update opportunities
			// With 10 chunks and yields between them, expect several updates
			expect(uiUpdates.length).toBeGreaterThan(3);
			console.log(`UI updates during processing: ${uiUpdates.length}`);
		});
	});

	describe('Mixed workload', () => {
		it('audit + sync flow with 10k records', async () => {
			const recordCount = 10000;

			// Setup: some local records, different server state
			const localProducts = generateProducts(5000);
			await storeDatabase.collections.products.bulkInsert(localProducts);

			// Server has different records (some overlap, some new, some deleted)
			const serverRecords = generateServerRecords(recordCount);

			const syncStateManager = new SyncStateManager({
				collection: storeDatabase.collections.products,
				syncCollection: syncDatabase.collections.products,
				endpoint: 'products',
			});

			const startTime = performance.now();
			await syncStateManager.processFullAudit(serverRecords);
			const duration = performance.now() - startTime;

			// Check sync state was populated correctly
			const syncDocs = await syncDatabase.collections.products.find().exec();

			// Should have entries for all server records
			expect(syncDocs.length).toBeGreaterThanOrEqual(recordCount);

			expect(duration).toBeLessThan(15000);
			console.log(`Mixed workload (5k local + 10k server): ${duration.toFixed(0)}ms`);
		});
	});
});
