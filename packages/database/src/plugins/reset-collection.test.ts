import { filter, firstValueFrom, Subject, timeout } from 'rxjs';

/**
 * Tests for reset-collection plugin logic.
 *
 * Note: Full RxDB integration tests are in @wcpos/query/tests/collection-swap.test.ts
 * which tests the actual swapCollection flow with the plugin.
 *
 * These tests focus on the plugin's core logic without requiring
 * actual RxDB database instances for every test.
 */

describe('reset-collection plugin', () => {
	describe('isManagedCollection logic', () => {
		// Test the concept of managed vs unmanaged collections
		const managedCollections = new Set(['products', 'orders', 'customers', 'variations']);

		function isManagedCollection(collectionName: string): boolean {
			return managedCollections.has(collectionName);
		}

		it('should identify managed collections', () => {
			expect(isManagedCollection('products')).toBe(true);
			expect(isManagedCollection('orders')).toBe(true);
			expect(isManagedCollection('customers')).toBe(true);
			expect(isManagedCollection('variations')).toBe(true);
		});

		it('should reject unmanaged collections', () => {
			expect(isManagedCollection('products-search-en-flexsearch')).toBe(false);
			expect(isManagedCollection('unknown')).toBe(false);
			expect(isManagedCollection('')).toBe(false);
		});

		it('should use Set lookup (O(1)) instead of string matching', () => {
			// The old approach was brittle: key.endsWith('flexsearch')
			// The new approach uses explicit Set membership
			expect(isManagedCollection('products')).toBe(true);
			expect(isManagedCollection('productsflexsearch')).toBe(false); // Would match old approach
			expect(isManagedCollection('flexsearch')).toBe(false);
			expect(isManagedCollection('products-flexsearch')).toBe(false);
		});

		it('should reject FlexSearch collections with various naming patterns', () => {
			// Test various FlexSearch collection name patterns
			expect(isManagedCollection('products-search-en-flexsearch')).toBe(false);
			expect(isManagedCollection('orders-search-de-flexsearch')).toBe(false);
			expect(isManagedCollection('customers-search-fr-flexsearch')).toBe(false);
		});
	});

	describe('database naming conventions', () => {
		it('should correctly identify store database by name prefix', () => {
			const isStoreDb = (name: string) => name.startsWith('store');
			const isFastStoreDb = (name: string) => name.startsWith('fast_store');

			expect(isStoreDb('store_abc123')).toBe(true);
			expect(isStoreDb('store')).toBe(true);
			expect(isStoreDb('fast_store_abc123')).toBe(false); // fast_store doesn't start with just 'store'
			expect(isFastStoreDb('fast_store_abc123')).toBe(true);
			expect(isFastStoreDb('store_abc123')).toBe(false);
		});

		it('should prioritize fast_store check before store check', () => {
			// This tests the order of checks in the plugin
			// fast_store must be checked first because 'store' is a substring of 'fast_store'
			const getDbType = (name: string): 'fast_store' | 'store' | 'other' => {
				if (name.startsWith('fast_store')) return 'fast_store';
				if (name.startsWith('store')) return 'store';
				return 'other';
			};

			expect(getDbType('fast_store_abc')).toBe('fast_store');
			expect(getDbType('store_abc')).toBe('store');
			expect(getDbType('user_abc')).toBe('other');
			expect(getDbType('')).toBe('other');
		});

		it('should handle edge cases in database naming', () => {
			const getDbType = (name: string): 'fast_store' | 'store' | 'other' => {
				if (name.startsWith('fast_store')) return 'fast_store';
				if (name.startsWith('store')) return 'store';
				return 'other';
			};

			// Edge cases
			expect(getDbType('STORE_abc')).toBe('other'); // Case sensitive
			expect(getDbType('Store_abc')).toBe('other');
			expect(getDbType('fast_STORE_abc')).toBe('other');
			expect(getDbType('storeproducts')).toBe('store'); // No underscore
		});
	});

	describe('reset$ observable pattern', () => {
		it('should create observable from Subject', () => {
			const resetSubject = new Subject<any>();
			const reset$ = resetSubject.asObservable();

			expect(reset$).toBeDefined();
			expect(typeof reset$.subscribe).toBe('function');
			expect(typeof reset$.pipe).toBe('function');

			resetSubject.complete();
		});

		it('should emit values to subscribers', (done) => {
			const resetSubject = new Subject<any>();
			const reset$ = resetSubject.asObservable();

			reset$.subscribe((value) => {
				expect(value.name).toBe('products');
				resetSubject.complete();
				done();
			});

			resetSubject.next({ name: 'products' });
		});

		it('should support multiple subscribers', () => {
			const resetSubject = new Subject<any>();
			const reset$ = resetSubject.asObservable();

			const results1: string[] = [];
			const results2: string[] = [];

			reset$.subscribe((value) => results1.push(value.name));
			reset$.subscribe((value) => results2.push(value.name));

			resetSubject.next({ name: 'products' });
			resetSubject.next({ name: 'orders' });

			expect(results1).toEqual(['products', 'orders']);
			expect(results2).toEqual(['products', 'orders']);

			resetSubject.complete();
		});

		it('should support filtering by collection name', () => {
			const resetSubject = new Subject<any>();
			const reset$ = resetSubject.asObservable();

			const productResets: string[] = [];
			const orderResets: string[] = [];

			reset$
				.pipe(filter((col) => col.name === 'products'))
				.subscribe((col) => productResets.push(col.name));

			reset$
				.pipe(filter((col) => col.name === 'orders'))
				.subscribe((col) => orderResets.push(col.name));

			resetSubject.next({ name: 'products' });
			resetSubject.next({ name: 'orders' });
			resetSubject.next({ name: 'products' });
			resetSubject.next({ name: 'customers' }); // Neither

			expect(productResets).toEqual(['products', 'products']);
			expect(orderResets).toEqual(['orders']);

			resetSubject.complete();
		});

		it('should support firstValueFrom for async waiting', async () => {
			const resetSubject = new Subject<any>();
			const reset$ = resetSubject.asObservable();

			const resetPromise = firstValueFrom(reset$.pipe(filter((col) => col.name === 'products')));

			// Emit after a short delay
			setTimeout(() => {
				resetSubject.next({ name: 'products' });
			}, 10);

			const result = await resetPromise;
			expect(result.name).toBe('products');

			resetSubject.complete();
		});

		it('should support timeout for error handling', async () => {
			const resetSubject = new Subject<any>();
			const reset$ = resetSubject.asObservable();

			const resetPromise = firstValueFrom(
				reset$.pipe(
					filter((col) => col.name === 'products'),
					timeout(50)
				)
			);

			// Don't emit anything - should timeout
			await expect(resetPromise).rejects.toThrow();

			resetSubject.complete();
		});

		it('should ignore emissions after completion', () => {
			const resetSubject = new Subject<any>();
			const reset$ = resetSubject.asObservable();

			const results: string[] = [];
			reset$.subscribe((value) => results.push(value.name));

			resetSubject.next({ name: 'products' });
			resetSubject.complete();
			resetSubject.next({ name: 'orders' }); // Should be ignored

			expect(results).toEqual(['products']);
		});
	});

	describe('plugin hook patterns', () => {
		it('should support createRxDatabase.after hook pattern', () => {
			// Simulate what the plugin does
			const mockDatabase = { name: 'store_abc', reset$: undefined };

			// Hook logic
			const storeReset = new Subject<any>();
			if (mockDatabase.name.startsWith('store')) {
				(mockDatabase as any).reset$ = storeReset.asObservable();
			}

			expect(mockDatabase.reset$).toBeDefined();

			storeReset.complete();
		});

		it('should support postCloseRxCollection.after hook pattern', async () => {
			// Simulate what happens when a collection is removed
			const mockCollection = {
				name: 'products',
				database: { name: 'store_abc' },
			};

			const managedCollections = new Set(['products', 'orders']);
			const readdedCollections: string[] = [];

			// Hook logic
			if (managedCollections.has(mockCollection.name)) {
				// Would re-add collection here
				readdedCollections.push(mockCollection.name);
			}

			expect(readdedCollections).toContain('products');
		});

		it('should skip unmanaged collections in postCloseRxCollection hook', () => {
			const mockCollection = {
				name: 'products-search-en-flexsearch',
				database: { name: 'store_abc' },
			};

			const managedCollections = new Set(['products', 'orders']);
			const readdedCollections: string[] = [];

			// Hook logic
			if (managedCollections.has(mockCollection.name)) {
				readdedCollections.push(mockCollection.name);
			}

			expect(readdedCollections).not.toContain('products-search-en-flexsearch');
			expect(readdedCollections).toHaveLength(0);
		});
	});

	describe('swapCollection pattern simulation', () => {
		it('should demonstrate the full swap cycle pattern', async () => {
			// Simulate the swap pattern without actual RxDB
			const resetSubject = new Subject<any>();
			const reset$ = resetSubject.asObservable();

			// Step 1: Set up listener before removal
			const resetPromise = firstValueFrom(
				reset$.pipe(
					filter((col) => col.name === 'products'),
					timeout(1000)
				)
			);

			// Step 2: Remove collection (simulated)
			// In real code: await collection.remove()

			// Step 3: Plugin re-adds collection and emits
			setTimeout(() => {
				const newCollection = { name: 'products', count: () => 0 };
				resetSubject.next(newCollection);
			}, 10);

			// Step 4: Wait for reset$ emission
			const newCollection = await resetPromise;

			expect(newCollection.name).toBe('products');
			expect(newCollection.count()).toBe(0);

			resetSubject.complete();
		});

		it('should handle multiple collection resets in sequence', async () => {
			const resetSubject = new Subject<any>();
			const reset$ = resetSubject.asObservable();

			const resetOrder: string[] = [];

			reset$.subscribe((col) => resetOrder.push(col.name));

			// Simulate multiple resets
			resetSubject.next({ name: 'products' });
			resetSubject.next({ name: 'variations' });
			resetSubject.next({ name: 'products' });

			expect(resetOrder).toEqual(['products', 'variations', 'products']);

			resetSubject.complete();
		});
	});
});
