import type { RxDatabase } from 'rxdb';
import { Subject } from 'rxjs';

import { httpClientMock } from './__mocks__/http';
import { createStoreDatabase, createSyncDatabase } from './helpers/db';
import { Manager } from '../src/manager';
import { swapCollection, swapCollections } from '../src/collection-swap';

// Mock the logger module
jest.mock('@wcpos/utils/src/logger');

describe('Collection Swap', () => {
	let storeDatabase: RxDatabase;
	let syncDatabase: RxDatabase;
	let manager: Manager<any>;

	beforeEach(async () => {
		storeDatabase = await createStoreDatabase();
		syncDatabase = await createSyncDatabase();
		manager = Manager.getInstance(storeDatabase, syncDatabase, httpClientMock);
	});

	afterEach(async () => {
		if (manager) {
			await manager.cancel();
		}
		if (storeDatabase && !storeDatabase.destroyed) {
			await storeDatabase.remove();
		}
		if (syncDatabase && !syncDatabase.destroyed) {
			await syncDatabase.remove();
		}
		jest.clearAllMocks();
	});

	describe('swapCollection', () => {
		it('should return success result with duration', async () => {
			// Mock reset$ to emit immediately
			const mockReset$ = new Subject();
			(storeDatabase as any).reset$ = mockReset$.asObservable();

			// Start swap (will wait for reset$)
			const swapPromise = swapCollection({
				manager,
				collectionName: 'products',
				storeDB: storeDatabase,
				fastStoreDB: syncDatabase,
				timeout: 5000,
			});

			// Simulate reset signal from reset-collection plugin
			// In real scenario, this is emitted by postCloseRxCollection hook
			setTimeout(() => {
				mockReset$.next({ name: 'products' });
			}, 100);

			const result = await swapPromise;

			expect(result.success).toBe(true);
			expect(result.duration).toBeGreaterThan(0);
			expect(result.error).toBeUndefined();
		});

		it('should call onCollectionReset to cancel operations', async () => {
			const mockReset$ = new Subject();
			(storeDatabase as any).reset$ = mockReset$.asObservable();

			const resetSpy = jest.spyOn(manager, 'onCollectionReset');

			const swapPromise = swapCollection({
				manager,
				collectionName: 'products',
				storeDB: storeDatabase,
				fastStoreDB: syncDatabase,
				timeout: 5000,
			});

			setTimeout(() => {
				mockReset$.next({ name: 'products' });
			}, 100);

			await swapPromise;

			expect(resetSpy).toHaveBeenCalled();
		});

		it('should timeout if reset$ does not emit', async () => {
			// Mock reset$ that never emits
			const mockReset$ = new Subject();
			(storeDatabase as any).reset$ = mockReset$.asObservable();

			const result = await swapCollection({
				manager,
				collectionName: 'products',
				storeDB: storeDatabase,
				fastStoreDB: syncDatabase,
				timeout: 100, // Very short timeout
			});

			expect(result.success).toBe(false);
			expect(result.error).toContain('Timeout');
		});

		it('should handle missing reset$ observable', async () => {
			// Temporarily remove reset$ to simulate missing plugin
			const originalReset$ = (storeDatabase as any).reset$;
			(storeDatabase as any).reset$ = undefined;

			try {
				const result = await swapCollection({
					manager,
					collectionName: 'products',
					storeDB: storeDatabase,
					fastStoreDB: syncDatabase,
				});

				expect(result.success).toBe(false);
				expect(result.error).toContain('reset$');
			} finally {
				// Restore reset$ for cleanup
				(storeDatabase as any).reset$ = originalReset$;
			}
		});
	});

	describe('swapCollections', () => {
		it('should swap multiple collections', async () => {
			const mockReset$ = new Subject();
			(storeDatabase as any).reset$ = mockReset$.asObservable();

			const swapPromise = swapCollections({
				manager,
				collectionNames: ['products', 'variations'],
				storeDB: storeDatabase,
				fastStoreDB: syncDatabase,
				timeout: 5000,
			});

			// Emit reset signals for each collection
			setTimeout(() => {
				mockReset$.next({ name: 'products' });
			}, 100);
			setTimeout(() => {
				mockReset$.next({ name: 'variations' });
			}, 200);

			const results = await swapPromise;

			expect(results).toHaveLength(2);
			expect(results[0].success).toBe(true);
			expect(results[1].success).toBe(true);
		});

		it('should stop on first failure', async () => {
			// Temporarily remove reset$ to cause failure
			const originalReset$ = (storeDatabase as any).reset$;
			(storeDatabase as any).reset$ = undefined;

			try {
				const results = await swapCollections({
					manager,
					collectionNames: ['products', 'variations'],
					storeDB: storeDatabase,
					fastStoreDB: syncDatabase,
				});

				expect(results).toHaveLength(1);
				expect(results[0].success).toBe(false);
			} finally {
				// Restore reset$ for cleanup
				(storeDatabase as any).reset$ = originalReset$;
			}
		});
	});

	describe('Integration with Manager', () => {
		it('should deregister queries when swapping', async () => {
			const mockReset$ = new Subject();
			(storeDatabase as any).reset$ = mockReset$.asObservable();

			// Register a query
			manager.registerQuery({
				queryKeys: ['swap-test-query'],
				collectionName: 'products',
				initialParams: {},
			});

			expect(manager.hasQuery(['swap-test-query'])).toBe(true);

			const swapPromise = swapCollection({
				manager,
				collectionName: 'products',
				storeDB: storeDatabase,
				fastStoreDB: syncDatabase,
				timeout: 5000,
			});

			setTimeout(() => {
				mockReset$.next({ name: 'products' });
			}, 100);

			await swapPromise;

			// Query should be deregistered after swap
			expect(manager.hasQuery(['swap-test-query'])).toBe(false);
		});
	});
});
