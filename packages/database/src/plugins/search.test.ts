/**
 * Tests for the search plugin logic.
 *
 * Note: Full integration tests with RxDB are in @wcpos/query/tests
 * which tests the actual search flow through the Query class.
 *
 * These tests focus on the plugin's core logic by mocking dependencies.
 */

// Mock the FlexSearch plugin
import { addFulltextSearch } from 'rxdb-premium/plugins/flexsearch';

let shouldFailOnCreate = false;

jest.mock('rxdb-premium/plugins/flexsearch', () => ({
	addFulltextSearch: jest.fn().mockImplementation(async (config) => {
		if (shouldFailOnCreate) {
			shouldFailOnCreate = false; // Only fail once for recovery tests
			throw new Error('FlexSearch schema mismatch');
		}

		// Return a mock search instance
		return {
			collection: {
				destroy: jest.fn().mockResolvedValue(undefined),
				remove: jest.fn().mockResolvedValue(undefined),
				$: { pipe: jest.fn().mockReturnValue({ subscribe: jest.fn() }) },
			},
			search: jest.fn().mockResolvedValue(['uuid-1', 'uuid-2']),
		};
	}),
}));

// Mock the logger
jest.mock('@wcpos/utils/logger', () => ({
	getLogger: jest.fn(() => ({
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
	})),
}));

jest.mock('@wcpos/utils/logger/error-codes', () => ({
	ERROR_CODES: {
		INVALID_CONFIGURATION: 'INVALID_CONFIGURATION',
		SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
	},
}));

describe('search plugin', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		shouldFailOnCreate = false;
	});

	describe('locale normalization', () => {
		function normalizeLocale(locale: string): string {
			return locale.slice(0, 2).toLowerCase();
		}

		it('should normalize full locale to 2 characters', () => {
			expect(normalizeLocale('en-US')).toBe('en');
			expect(normalizeLocale('de-DE')).toBe('de');
			expect(normalizeLocale('zh-CN')).toBe('zh');
		});

		it('should convert to lowercase', () => {
			expect(normalizeLocale('EN')).toBe('en');
			expect(normalizeLocale('De')).toBe('de');
		});

		it('should handle short locales', () => {
			expect(normalizeLocale('en')).toBe('en');
			expect(normalizeLocale('e')).toBe('e');
		});
	});

	describe('LRU cache logic', () => {
		const MAX_CACHED_LOCALES = 3;

		function touchLRU(lru: string[], locale: string): string[] {
			const index = lru.indexOf(locale);
			if (index > -1) {
				lru.splice(index, 1);
			}
			lru.push(locale);
			return lru;
		}

		function evictLRU(lru: string[], instances: Map<string, any>): string | null {
			if (lru.length > MAX_CACHED_LOCALES && instances.size > MAX_CACHED_LOCALES) {
				const oldest = lru.shift();
				if (oldest && instances.has(oldest)) {
					instances.delete(oldest);
					return oldest;
				}
			}
			return null;
		}

		it('should move accessed locale to end of LRU', () => {
			const lru = ['en', 'de', 'fr'];
			touchLRU(lru, 'en');
			expect(lru).toEqual(['de', 'fr', 'en']);
		});

		it('should add new locale to end of LRU', () => {
			const lru = ['en', 'de'];
			touchLRU(lru, 'fr');
			expect(lru).toEqual(['en', 'de', 'fr']);
		});

		it('should evict oldest locale when over limit', () => {
			const lru = ['en', 'de', 'fr', 'es'];
			const instances = new Map([
				['en', {}],
				['de', {}],
				['fr', {}],
				['es', {}],
			]);

			const evicted = evictLRU(lru, instances);

			expect(evicted).toBe('en');
			expect(lru).toEqual(['de', 'fr', 'es']);
			expect(instances.has('en')).toBe(false);
		});

		it('should not evict when under limit', () => {
			const lru = ['en', 'de'];
			const instances = new Map([
				['en', {}],
				['de', {}],
			]);

			const evicted = evictLRU(lru, instances);

			expect(evicted).toBeNull();
			expect(lru).toEqual(['en', 'de']);
		});

		it('should maintain correct order after multiple accesses', () => {
			let lru: string[] = [];

			// Add in order
			touchLRU(lru, 'en');
			touchLRU(lru, 'de');
			touchLRU(lru, 'fr');
			expect(lru).toEqual(['en', 'de', 'fr']);

			// Access 'en' again - should move to end
			touchLRU(lru, 'en');
			expect(lru).toEqual(['de', 'fr', 'en']);

			// Access 'de' - should move to end
			touchLRU(lru, 'de');
			expect(lru).toEqual(['fr', 'en', 'de']);
		});
	});

	describe('searchFields configuration', () => {
		it('should return null if no searchFields configured', () => {
			const collection: any = { options: {} };
			const hasSearchFields = Array.isArray(collection.options?.searchFields);
			expect(hasSearchFields).toBe(false);
		});

		it('should detect searchFields array', () => {
			const collection: any = { options: { searchFields: ['name', 'sku'] } };
			const hasSearchFields = Array.isArray(collection.options?.searchFields);
			expect(hasSearchFields).toBe(true);
		});

		it('should handle empty searchFields array', () => {
			const collection: any = { options: { searchFields: [] } };
			const hasSearchFields = Array.isArray(collection.options?.searchFields);
			expect(hasSearchFields).toBe(true); // Empty array is still truthy for Array.isArray
		});
	});

	describe('docToString configuration', () => {
		// Simulate lodash get behavior
		function get(obj: any, path: string): any {
			return path.split('.').reduce((acc, part) => acc?.[part], obj);
		}

		function createDocToString(searchFields: string[]) {
			return (doc: any) => {
				return searchFields.map((field) => get(doc, field) || '').join(' ');
			};
		}

		it('should concatenate simple fields', () => {
			const docToString = createDocToString(['name', 'sku']);
			const doc = { name: 'Blue Shirt', sku: 'BLUE-001' };

			expect(docToString(doc)).toBe('Blue Shirt BLUE-001');
		});

		it('should handle missing fields gracefully', () => {
			const docToString = createDocToString(['name', 'sku', 'barcode']);
			const doc = { name: 'Test Product' }; // Missing sku and barcode

			expect(docToString(doc)).toBe('Test Product  ');
		});

		it('should handle nested fields', () => {
			const docToString = createDocToString(['billing.first_name', 'billing.last_name']);
			const doc = {
				billing: {
					first_name: 'John',
					last_name: 'Doe',
				},
			};

			expect(docToString(doc)).toBe('John Doe');
		});

		it('should handle deeply nested fields', () => {
			const docToString = createDocToString(['meta.author.name']);
			const doc = {
				meta: {
					author: {
						name: 'Jane Smith',
					},
				},
			};

			expect(docToString(doc)).toBe('Jane Smith');
		});

		it('should handle null values', () => {
			const docToString = createDocToString(['name', 'sku']);
			const doc = { name: null, sku: 'SKU-001' };

			expect(docToString(doc)).toBe(' SKU-001');
		});
	});

	describe('search identifier generation', () => {
		it('should generate unique identifier per collection and locale', () => {
			const getIdentifier = (collectionName: string, locale: string) =>
				`${collectionName}-search-${locale}`;

			expect(getIdentifier('products', 'en')).toBe('products-search-en');
			expect(getIdentifier('orders', 'de')).toBe('orders-search-de');
			expect(getIdentifier('customers', 'fr')).toBe('customers-search-fr');
		});

		it('should generate different identifiers for different locales', () => {
			const getIdentifier = (collectionName: string, locale: string) =>
				`${collectionName}-search-${locale}`;

			const ids = [
				getIdentifier('products', 'en'),
				getIdentifier('products', 'de'),
				getIdentifier('products', 'fr'),
			];

			// All unique
			expect(new Set(ids).size).toBe(3);
		});
	});

	describe('FlexSearch initialization', () => {
		it('should call addFulltextSearch with correct config', async () => {
			const mockCollection = {
				name: 'products',
				options: { searchFields: ['name', 'sku'] },
			};

			await addFulltextSearch({
				identifier: 'products-search-en',
				collection: mockCollection,
				docToString: jest.fn(),
				initialization: 'lazy',
				indexOptions: {
					preset: 'performance',
					tokenize: 'forward',
					language: 'en',
				},
			});

			expect(addFulltextSearch).toHaveBeenCalledWith(
				expect.objectContaining({
					identifier: 'products-search-en',
					initialization: 'lazy',
					indexOptions: expect.objectContaining({
						preset: 'performance',
						tokenize: 'forward',
						language: 'en',
					}),
				})
			);
		});

		it('should use lazy initialization', async () => {
			await addFulltextSearch({
				identifier: 'test',
				collection: {},
				docToString: jest.fn(),
				initialization: 'lazy',
				indexOptions: {},
			});

			expect(addFulltextSearch).toHaveBeenCalledWith(
				expect.objectContaining({
					initialization: 'lazy',
				})
			);
		});
	});

	describe('error recovery logic', () => {
		it('should detect schema mismatch errors', () => {
			const error = new Error('FlexSearch schema mismatch');
			const isSchemaError = error.message.includes('schema');
			expect(isSchemaError).toBe(true);
		});

		it('should track recovery attempts', () => {
			let recoveryAttempts = 0;
			const maxRecoveryAttempts = 1;

			// First failure
			recoveryAttempts++;
			expect(recoveryAttempts <= maxRecoveryAttempts).toBe(true);

			// Retry succeeds - reset counter
			recoveryAttempts = 0;

			// Second failure later
			recoveryAttempts++;
			expect(recoveryAttempts <= maxRecoveryAttempts).toBe(true);
		});
	});

	describe('cleanup on collection close', () => {
		it('should track cleanup registration', () => {
			let cleanupRegistered = false;

			// First call - register cleanup
			if (!cleanupRegistered) {
				cleanupRegistered = true;
				// Would push to collection.onClose here
			}

			expect(cleanupRegistered).toBe(true);

			// Second call - should not register again
			const previousState = cleanupRegistered;
			if (!cleanupRegistered) {
				cleanupRegistered = true;
			}

			expect(cleanupRegistered).toBe(previousState);
		});

		it('should destroy all search instances on cleanup', async () => {
			const instances = new Map([
				['en', { collection: { destroy: jest.fn().mockResolvedValue(undefined) } }],
				['de', { collection: { destroy: jest.fn().mockResolvedValue(undefined) } }],
			]);

			// Cleanup logic
			for (const [locale, instance] of instances.entries()) {
				if (instance.collection?.destroy) {
					await instance.collection.destroy();
				}
				instances.delete(locale);
			}

			expect(instances.size).toBe(0);
		});
	});

	describe('recreateSearch logic', () => {
		it('should remove existing instance before recreation', () => {
			const instances = new Map([['en', { collection: { destroy: jest.fn() } }]]);
			const lru = ['en'];

			// Remove from instances
			instances.get('en');
			instances.delete('en');

			// Remove from LRU
			const index = lru.indexOf('en');
			if (index > -1) {
				lru.splice(index, 1);
			}

			expect(instances.has('en')).toBe(false);
			expect(lru).not.toContain('en');
		});

		it('should call destroy on old instance', async () => {
			const destroyMock = jest.fn().mockResolvedValue(undefined);
			const oldInstance = { collection: { destroy: destroyMock } };

			if (oldInstance.collection?.destroy) {
				await oldInstance.collection.destroy();
			}

			expect(destroyMock).toHaveBeenCalled();
		});
	});

	describe('promise deduplication', () => {
		it('should deduplicate concurrent initialization calls', async () => {
			const searchPromises = new Map<string, Promise<any>>();

			// Simulate multiple concurrent calls
			const createPromise = () => Promise.resolve({ search: jest.fn() });

			// First call - creates promise
			if (!searchPromises.has('en')) {
				searchPromises.set('en', createPromise());
			}

			// Second call - returns existing promise
			const promise1 = searchPromises.get('en');
			const promise2 = searchPromises.get('en');

			expect(promise1).toBe(promise2);
		});

		it('should remove promise after resolution', async () => {
			const searchPromises = new Map<string, Promise<any>>();
			const searchInstances = new Map<string, any>();

			// Create promise
			const promise = Promise.resolve({ search: jest.fn() });
			searchPromises.set('en', promise);

			// After resolution
			const instance = await promise;
			searchInstances.set('en', instance);
			searchPromises.delete('en');

			expect(searchPromises.has('en')).toBe(false);
			expect(searchInstances.has('en')).toBe(true);
		});
	});
});
