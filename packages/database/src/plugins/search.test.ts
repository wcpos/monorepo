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
// Real FlexSearch engine, used by the tokenizer-behaviour tests below.
import { Index } from 'flexsearch';
import { getAllCollectionDocuments, removeCollectionStorages } from 'rxdb';

import { deriveBarcodeFromPayload, encodeSearchText } from '@wcpos/sync-core';
import { getLogger } from '@wcpos/utils/logger';

import {
	getSearchIdentifier,
	removePersistedSearchIndexes,
	searchPlugin,
	staleSearchCollectionNames,
} from './search';

import type { RxCollection } from 'rxdb';

let shouldFailOnCreate = false;

// The plugin only imports the storage-removal helper from rxdb; types are erased.
jest.mock('rxdb', () => ({
	removeCollectionStorages: jest.fn().mockResolvedValue(undefined),
	// A recreate now rebuilds through createSearchInstance's `existing` branch, which resets
	// the pipeline checkpoint before dropping the storage. These fixtures persist no
	// checkpoint, so the reset is a lookup that finds nothing; search-rebuild.test.ts covers
	// the real thing against real rxdb.
	getPrimaryKeyOfInternalDocument: jest.fn((key: string) => key),
	INTERNAL_CONTEXT_PIPELINE_CHECKPOINT: 'rx-pipeline-checkpoint',
	flatCloneDocWithMeta: jest.fn((doc: unknown) => ({ ...(doc as object) })),
	createRevision: jest.fn(() => '1-rev'),
	now: jest.fn(() => 0),
	getAllCollectionDocuments: jest.fn().mockResolvedValue([]),
}));

jest.mock('rxdb-premium/plugins/flexsearch', () => ({
	addFulltextSearch: jest.fn().mockImplementation(async (config) => {
		if (shouldFailOnCreate) {
			shouldFailOnCreate = false; // Only fail once for recovery tests
			throw new Error('FlexSearch schema mismatch');
		}

		// Return a mock search instance
		return {
			collection: {
				__wcposAppendIndex: {},
				_changeEventBuffer: { limit: 100 },
				destroy: jest.fn().mockResolvedValue(undefined),
				remove: jest.fn().mockResolvedValue(undefined),
				// A real RxCollection has close() as well as remove(); eviction calls it.
				close: jest.fn().mockResolvedValue(undefined),
				$: { pipe: jest.fn().mockReturnValue({ subscribe: jest.fn() }) },
				// A healthy index: no appended entries, so the oversized-index check never rebuilds here.
				find: jest.fn(() => ({ exec: jest.fn().mockResolvedValue([]) })),
			},
			close: jest.fn().mockResolvedValue(undefined),
			pipeline: { close: jest.fn().mockResolvedValue(undefined) },
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

const searchLogger = jest.mocked(getLogger).mock.results[0].value;

describe('search plugin', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		shouldFailOnCreate = false;
	});

	describe('instance lifecycle', () => {
		function makeCollection() {
			const prototype: Record<string, unknown> = {};
			const install = searchPlugin.prototypes?.RxCollection;
			if (!install) throw new Error('search plugin RxCollection prototype is missing');
			install(prototype as unknown as RxCollection);
			return Object.assign(Object.create(prototype), {
				name: 'products',
				options: { searchFields: ['name'] },
				database: {
					collections: {},
					// Reached by the checkpoint reset on the rebuild path; no checkpoint here.
					internalStore: {
						findDocumentsById: jest.fn().mockResolvedValue([]),
						bulkWrite: jest.fn().mockResolvedValue({ error: [] }),
					},
				},
				onClose: [],
				count: () => ({ exec: async () => 0 }),
			});
		}

		function deferred() {
			let resolve!: () => void;
			const promise = new Promise<void>((done) => {
				resolve = done;
			});
			return { promise, resolve };
		}

		it('eviction closes only the evicted instance, pipeline first', async () => {
			const collection = makeCollection();
			const instances = [];
			for (const locale of ['en', 'de', 'fr', 'es']) {
				instances.push(await collection.initSearch(locale));
			}
			const [evicted, ...retained] = instances;
			expect(evicted.pipeline.close).toHaveBeenCalledTimes(1);
			expect(evicted.close).toHaveBeenCalledTimes(1);
			expect(evicted.pipeline.close.mock.invocationCallOrder[0]).toBeLessThan(
				evicted.close.mock.invocationCallOrder[0]
			);
			expect(evicted.collection).not.toHaveProperty('__wcposAppendIndex');
			// Nothing rebuilds an evicted locale, so its destination is deregistered too:
			// the onClose hook holds the whole index until the collection itself closes.
			expect(evicted.collection.close).toHaveBeenCalledTimes(1);
			expect(evicted.collection.remove).not.toHaveBeenCalled();
			for (const instance of retained) {
				expect(instance.pipeline.close).not.toHaveBeenCalled();
				expect(instance.close).not.toHaveBeenCalled();
				expect(instance.collection.close).not.toHaveBeenCalled();
				expect(instance.collection).toHaveProperty('__wcposAppendIndex');
			}
		});

		it('recreate closes the old instance before building the new one', async () => {
			const collection = makeCollection();
			const old = await collection.initSearch('en');
			const remove = jest.fn().mockResolvedValue(undefined);
			collection.database.collections[`${getSearchIdentifier('products', 'en')}_flexsearch`] = {
				remove,
			};
			const fulltextSearch = addFulltextSearch as jest.Mock;
			const create = fulltextSearch.getMockImplementation()!;
			fulltextSearch.mockImplementationOnce((config) => {
				expect(old.pipeline.close).toHaveBeenCalledTimes(1);
				expect(old.close).toHaveBeenCalledTimes(1);
				expect(old.collection).not.toHaveProperty('__wcposAppendIndex');
				delete collection.database.collections[
					`${getSearchIdentifier('products', 'en')}_flexsearch`
				];
				return create(config);
			});
			remove.mockImplementation(async () => {
				delete collection.database.collections[
					`${getSearchIdentifier('products', 'en')}_flexsearch`
				];
			});
			const replacement = await collection.recreateSearch('en');
			expect(remove).toHaveBeenCalledTimes(1);
			expect(old.close.mock.invocationCallOrder[0]).toBeLessThan(
				remove.mock.invocationCallOrder[0]
			);
			expect(replacement).not.toBe(old);
			expect(collection._searchInstances.get('en')).toBe(replacement);
		});

		it.each([false, true])(
			'cleanup continues on pipeline rejection (close rejects: %s)',
			async (closeRejects) => {
				const collection = makeCollection();
				const old = await collection.initSearch('en');
				old.pipeline.close.mockRejectedValue(new Error('pipeline failed'));
				if (closeRejects) old.close.mockRejectedValue(new Error('instance failed'));
				await collection.initSearch('de');
				await collection.initSearch('fr');
				await expect(collection.initSearch('es')).resolves.toBeDefined();
				expect(old.close).toHaveBeenCalledTimes(1);
				expect(old.collection).not.toHaveProperty('__wcposAppendIndex');
				expect(searchLogger.warn).toHaveBeenCalledWith(
					expect.any(String),
					expect.objectContaining({
						context: expect.objectContaining({ error: 'pipeline failed' }),
					})
				);
			}
		);

		it('an init already past the cache check cannot outlive a recreate', async () => {
			const collection = makeCollection();
			const started = deferred();
			const gate = deferred();
			const fulltextSearch = addFulltextSearch as jest.Mock;
			const create = fulltextSearch.getMockImplementation()!;
			fulltextSearch.mockImplementationOnce(async (config) => {
				started.resolve();
				await gate.promise;
				return create(config);
			});
			const init = collection.initSearch('en');
			await started.promise;
			const recreate = collection.recreateSearch('en');
			gate.resolve();
			const [fromInit, replacement] = await Promise.all([init, recreate]);
			const old = await fulltextSearch.mock.results[0].value;
			expect(collection._searchInstances.size).toBe(1);
			expect(collection._searchInstances.get('en')).toBe(replacement);
			expect(replacement).not.toBe(old);
			// The init's caller is not handed the instance the recreate just closed.
			expect(fromInit).toBe(replacement);
			expect(old.close).toHaveBeenCalledTimes(1);
			expect(old.pipeline.close).toHaveBeenCalledTimes(1);
			expect(old.collection).not.toHaveProperty('__wcposAppendIndex');
		});

		it('an init in the same tick as a recreate joins the replacement', async () => {
			// The chain defers the rebuild to a later microtask. Without retiring the cached
			// instance synchronously, this init takes the fast path and receives the instance
			// the queued recreate is about to close.
			const collection = makeCollection();
			const old = await collection.initSearch('en');
			const recreate = collection.recreateSearch('en');
			const joined = collection.initSearch('en');
			const [replacement, fromInit] = await Promise.all([recreate, joined]);
			expect(fromInit).toBe(replacement);
			expect(fromInit).not.toBe(old);
			expect(old.close).toHaveBeenCalledTimes(1);
			expect(collection._searchInstances.get('en')).toBe(replacement);
			expect(collection._searchInstances.size).toBe(1);
		});

		it('an init requested after a recreate does not join an init still building', async () => {
			// While the first init is still creating, recreate has nothing cached to retire; it
			// must still drop the dedupe entry so a later init queues behind the rebuild.
			const collection = makeCollection();
			const started = deferred();
			const gate = deferred();
			const fulltextSearch = addFulltextSearch as jest.Mock;
			const create = fulltextSearch.getMockImplementation()!;
			fulltextSearch.mockImplementationOnce(async (config) => {
				started.resolve();
				await gate.promise;
				return create(config);
			});
			const first = collection.initSearch('en');
			await started.promise;
			const recreate = collection.recreateSearch('en');
			const later = collection.initSearch('en');
			gate.resolve();
			const [fromFirst, replacement, fromLater] = await Promise.all([first, recreate, later]);
			const built = await fulltextSearch.mock.results[0].value;
			expect(fromLater).toBe(replacement);
			expect(replacement).not.toBe(built);
			// Both callers end up on the live replacement; the instance built first was retired.
			expect(fromFirst).toBe(replacement);
			expect(built.close).toHaveBeenCalledTimes(1);
			expect(collection._searchInstances.get('en')).toBe(replacement);
			expect(collection._searchInstances.size).toBe(1);
		});

		it('an init whose locale is evicted before it returns hands back a live instance', async () => {
			// Cache full with en/de/fr. While es is being created, the other three are touched
			// after es publishes but before its eviction pass runs, so es becomes the LRU head
			// and its own eviction closes it. The caller must not receive that closed instance.
			const collection = makeCollection();
			for (const locale of ['en', 'de', 'fr']) await collection.initSearch(locale);
			const fulltextSearch = addFulltextSearch as jest.Mock;
			// The moment es is recorded in the LRU (inside its chain, before the deferred
			// eviction callback), the cached three are touched: cached-locale inits touch
			// synchronously on the fast path. es is then the LRU head when eviction runs.
			const lru = collection._localeLRU as string[];
			const push = lru.push.bind(lru);
			let armed = true;
			lru.push = (locale: string) => {
				const length = push(locale);
				if (armed && locale === 'es') {
					armed = false;
					for (const cached of ['en', 'de', 'fr']) collection.initSearch(cached);
				}
				return length;
			};
			const returned = await collection.initSearch('es');
			// The fourth create is the es instance the eviction closed; the fifth is the live one.
			const builtFirst = await fulltextSearch.mock.results[3].value;
			expect(fulltextSearch).toHaveBeenCalledTimes(5);
			expect(builtFirst.close).toHaveBeenCalledTimes(1);
			expect(returned).not.toBe(builtFirst);
			expect(returned.close).not.toHaveBeenCalled();
			expect(collection._searchInstances.get('es')).toBe(returned);
			expect(collection._searchInstances.size).toBe(3);
		});

		it('concurrent init for a different locale is not blocked', async () => {
			const collection = makeCollection();
			await collection.initSearch('en');
			const started = deferred();
			const gate = deferred();
			const fulltextSearch = addFulltextSearch as jest.Mock;
			const create = fulltextSearch.getMockImplementation()!;
			fulltextSearch.mockImplementationOnce(async (config) => {
				started.resolve();
				await gate.promise;
				return create(config);
			});
			let recreated = false;
			const recreate = collection.recreateSearch('en').then((instance: unknown) => {
				recreated = true;
				return instance;
			});
			await started.promise;
			const sameLocaleInit = collection.initSearch('en');
			try {
				const german = await collection.initSearch('de');
				expect(collection._searchInstances.get('de')).toBe(german);
				expect(recreated).toBe(false);
			} finally {
				gate.resolve();
			}
			expect(await sameLocaleInit).toBe(await recreate);
			expect(fulltextSearch).toHaveBeenCalledTimes(3);
		});

		it('collection close tears every instance down', async () => {
			const collection = makeCollection();
			const instances = [await collection.initSearch('en'), await collection.initSearch('de')];
			for (const close of collection.onClose) await close();
			for (const instance of instances) {
				expect(instance.pipeline.close).toHaveBeenCalledTimes(1);
				expect(instance.close).toHaveBeenCalledTimes(1);
				expect(instance.collection).not.toHaveProperty('__wcposAppendIndex');
			}
			expect(collection._searchInstances.size).toBe(0);
		});
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
		it('should generate a versioned, unique identifier per collection and locale', () => {
			// The version tag (v5) is migration-critical: it forces the rxdb-premium
			// flexsearch pipeline to rebuild the persisted index from scratch when the
			// index config changes. Guard it explicitly. See #679, #1732, and the v5 decimal-comma fix.
			expect(getSearchIdentifier('products', 'en')).toBe('products-search-v5-en');
			expect(getSearchIdentifier('orders', 'de')).toBe('orders-search-v5-de');
			expect(getSearchIdentifier('customers', 'fr')).toBe('customers-search-v5-fr');
		});

		it('should generate different identifiers for different locales', () => {
			const ids = [
				getSearchIdentifier('products', 'en'),
				getSearchIdentifier('products', 'de'),
				getSearchIdentifier('products', 'fr'),
			];

			// All unique
			expect(new Set(ids).size).toBe(3);
		});
	});

	describe('FlexSearch initialization', () => {
		it('refuses to build an index for a collection that opts out, whatever the caller asks', async () => {
			// logs: a 46k-row day cost 21.5 s and ~350 MB to index in the renderer
			// (2026-09-15); the Logs screen scans instead. Refusing at the plugin
			// means no warmup, audit or binding can build it by accident.
			const collectionPrototype: Record<string, unknown> = {};
			const install = searchPlugin.prototypes?.RxCollection;
			if (!install) throw new Error('search plugin RxCollection prototype is missing');
			install(collectionPrototype as unknown as RxCollection);
			const collection = Object.assign(Object.create(collectionPrototype), {
				name: 'logs',
				options: { searchFields: ['message'], searchIndex: false },
				database: { collections: {} },
				onClose: [],
				count: () => ({ exec: async () => 0 }),
			});

			await expect(collection.initSearch('en')).resolves.toBeNull();
			await expect(
				collection.initSearch('en', { searchFields: ['message', 'context.search'] })
			).resolves.toBeNull();
			// The rebuild path honours the opt-out too (Codex review).
			await expect(collection.recreateSearch('en')).resolves.toBeNull();
			expect(addFulltextSearch).not.toHaveBeenCalled();
		});

		it('reclaims the persisted indexes of a collection that now refuses one, every version and locale', async () => {
			const database = {
				name: 'upgraded-db',
				collections: {},
				internalStore: { id: 'internal' },
				storage: { name: 'memory' },
				token: 'token',
				multiInstance: false,
				password: undefined,
				hashFunction: jest.fn(),
			};
			(getAllCollectionDocuments as jest.Mock).mockResolvedValueOnce([
				{ data: { name: 'logs' } },
				{ data: { name: 'logs-search-v4-es_flexsearch' } },
				{ data: { name: 'logs-search-v3-en_flexsearch' } },
				{ data: { name: 'products-search-v4-en_flexsearch' } },
			]);
			(removeCollectionStorages as jest.Mock).mockClear();
			const collection = {
				name: 'logs',
				options: { searchFields: ['message'], searchIndex: false },
				database,
			} as unknown as RxCollection;

			const after = searchPlugin.hooks?.createRxCollection?.after;
			if (!after) throw new Error('search plugin createRxCollection hook is missing');
			after({ collection } as never);
			await expect(removePersistedSearchIndexes(collection)).resolves.toEqual([]); // once per session

			await new Promise((resolve) => setTimeout(resolve, 0));
			const removed = (removeCollectionStorages as jest.Mock).mock.calls.map((call) => call[4]);
			expect(removed).toEqual(['logs-search-v4-es_flexsearch', 'logs-search-v3-en_flexsearch']);
		});

		it('a failed enumeration is logged and does not spend the once-per-session sweep (Codex review)', async () => {
			const database = {
				name: 'flaky-db',
				collections: {},
				internalStore: { id: 'internal' },
				storage: { name: 'memory' },
				token: 'token',
				multiInstance: false,
				password: undefined,
				hashFunction: jest.fn(),
			};
			const collection = {
				name: 'logs',
				options: { searchFields: ['message'], searchIndex: false },
				database,
			} as unknown as RxCollection;
			(getAllCollectionDocuments as jest.Mock)
				.mockRejectedValueOnce(new Error('worker not ready'))
				.mockResolvedValueOnce([{ data: { name: 'logs-search-v4-en_flexsearch' } }]);
			(removeCollectionStorages as jest.Mock).mockClear();

			await expect(removePersistedSearchIndexes(collection)).resolves.toEqual([]);
			// The failure was swallowed as "nothing removed", not thrown, and the
			// retry is not short-circuited by the once-per-session sweep key.
			await expect(removePersistedSearchIndexes(collection)).resolves.toEqual([
				'logs-search-v4-en_flexsearch',
			]);
			expect((removeCollectionStorages as jest.Mock).mock.calls.map((call) => call[4])).toEqual([
				'logs-search-v4-en_flexsearch',
			]);
		});

		it('a failed removal releases the sweep so the next opener retries the leftover (review)', async () => {
			const database = {
				name: 'partial-db',
				collections: {},
				internalStore: { id: 'internal' },
				storage: { name: 'memory' },
				token: 'token',
				multiInstance: false,
				password: undefined,
				hashFunction: jest.fn(),
			};
			const collection = {
				name: 'logs',
				options: { searchFields: ['message'], searchIndex: false },
				database,
			} as unknown as RxCollection;
			(getAllCollectionDocuments as jest.Mock).mockResolvedValue([
				{ data: { name: 'logs-search-v4-en_flexsearch' } },
			]);
			(removeCollectionStorages as jest.Mock)
				.mockClear()
				.mockRejectedValueOnce(new Error('storage busy'))
				.mockResolvedValueOnce(undefined);

			await expect(removePersistedSearchIndexes(collection)).resolves.toEqual([]);
			await expect(removePersistedSearchIndexes(collection)).resolves.toEqual([
				'logs-search-v4-en_flexsearch',
			]);
			expect(removeCollectionStorages).toHaveBeenCalledTimes(2);
			(getAllCollectionDocuments as jest.Mock).mockResolvedValue([]);
		});

		it('passes the caller snapshot and intended index options to FlexSearch', async () => {
			const collectionPrototype: Record<string, unknown> = {};
			const install = searchPlugin.prototypes?.RxCollection;
			if (!install) throw new Error('search plugin RxCollection prototype is missing');
			install(collectionPrototype as unknown as RxCollection);

			const collection = Object.assign(Object.create(collectionPrototype), {
				name: 'products',
				options: {},
				database: { collections: {} },
				onClose: [],
				count: () => ({ exec: async () => 0 }),
			});
			const documentSnapshot = (document: Record<string, unknown>) => ({
				...(document.payload as Record<string, unknown>),
				uuid: document.id,
			});

			await collection.initSearch('en', {
				searchFields: ['name', 'sku'],
				documentSnapshot,
			});

			const config = (addFulltextSearch as jest.Mock).mock.calls[0][0] as {
				docToString(document: Record<string, unknown>): string;
				indexOptions: { encode?: typeof encodeSearchText; minlength?: number };
			};
			expect(config.indexOptions.encode).toBe(encodeSearchText);
			expect(config.indexOptions.minlength).toBe(3);
			expect(
				config.docToString({
					id: 'product-1',
					payload: { name: 'Payload Keyboard', sku: 'KB-1' },
				})
			).toBe('Payload Keyboard KB-1');
			expect(
				config.docToString({
					id: 'product-1',
					payload: { name: 'Renamed Keyboard', sku: 'KB-1' },
				})
			).toBe('Renamed Keyboard KB-1');
		});

		it('drops the persisted indexes of superseded identifier versions, never the current one', async () => {
			const collectionPrototype: Record<string, unknown> = {};
			const install = searchPlugin.prototypes?.RxCollection;
			if (!install) throw new Error('search plugin RxCollection prototype is missing');
			install(collectionPrototype as unknown as RxCollection);
			const database = {
				name: 'sweep-db',
				collections: {},
				internalStore: { id: 'internal' },
				storage: { name: 'memory' },
				token: 'token',
				multiInstance: false,
				password: undefined,
				hashFunction: jest.fn(),
			};
			const collection = Object.assign(Object.create(collectionPrototype), {
				name: 'products',
				options: { searchFields: ['name'] },
				database,
				onClose: [],
				count: () => ({ exec: async () => 0 }),
			});
			(removeCollectionStorages as jest.Mock).mockClear();

			await collection.initSearch('en');

			const removed = (removeCollectionStorages as jest.Mock).mock.calls.map((call) => call[4]);
			expect(removed).toEqual([
				'products-search-en_flexsearch',
				'products-search-v2-en_flexsearch',
				'products-search-v3-en_flexsearch',
				'products-search-v4-en_flexsearch',
			]);
			expect(removed).toEqual(staleSearchCollectionNames('products', 'en'));
			expect(removed).not.toContain(`${getSearchIdentifier('products', 'en')}_flexsearch`);
			expect((removeCollectionStorages as jest.Mock).mock.calls[0].slice(0, 4)).toEqual([
				database.storage,
				database.internalStore,
				database.token,
				database.name,
			]);
		});

		it('should call addFulltextSearch with correct config', async () => {
			const mockCollection = {
				name: 'products',
				options: { searchFields: ['name', 'sku'] },
			} as unknown as RxCollection;

			await addFulltextSearch({
				identifier: getSearchIdentifier('products', 'en'),
				collection: mockCollection,
				docToString: jest.fn(),
				initialization: 'lazy',
				indexOptions: {
					preset: 'performance',
					tokenize: 'full',
					language: 'en',
				},
			});

			expect(addFulltextSearch).toHaveBeenCalledWith(
				expect.objectContaining({
					identifier: getSearchIdentifier('products', 'en'),
					initialization: 'lazy',
					indexOptions: expect.objectContaining({
						preset: 'performance',
						tokenize: 'full',
						language: 'en',
					}),
				})
			);
		});

		it('should use lazy initialization', async () => {
			await addFulltextSearch({
				identifier: 'test',
				collection: {} as unknown as RxCollection,
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

	// Exercises the real FlexSearch engine (not the mocked rxdb-premium wrapper) to lock
	// in the tokenizer behaviour our production config depends on. Guards against a
	// FlexSearch/rxdb-premium upgrade silently changing tokenizer semantics. See #679.
	describe('tokenizer behaviour (WooCommerce parity)', () => {
		// Mirrors createSearchInstance's indexOptions (minus language stemming).
		const buildIndex = (tokenize: 'forward' | 'full') => {
			const indexOptions = {
				preset: 'performance',
				tokenize,
				minlength: 3,
				encode: encodeSearchText,
			} as const;
			const index = new Index(indexOptions);
			index.add(1, 'Kuorintasaippua'); // Finnish compound: "exfoliating soap"
			index.add(2, 'Blue Cotton Shirt');
			index.add(3, 'Château du Cèdre 2022');
			index.add(4, 'Cèdre 2023'.normalize('NFD'));
			index.add(5, 'ModelX Coil 0.4ohm');
			index.add(6, 'ModelX Coil 0.6ohm');
			index.add(7, 'ModelX Tank WCP-0001-BLK');
			return index;
		};

		it("'full' matches a mid-word substring the way WooCommerce LIKE '%term%' does", () => {
			const index = buildIndex('full');
			// "saippua" (soap) is the tail of the compound word, not a prefix.
			expect(index.search('saippua')).toContain(1);
			// Interior fragment of a normal word also matches (contains semantics).
			expect(index.search('otto')).toContain(2); // inside "Cotton"
		});

		it("'forward' (the old config) misses mid-word substrings — the bug we are fixing", () => {
			const index = buildIndex('forward');
			expect(index.search('saippua')).not.toContain(1);
		});

		it('still matches word prefixes (no regression for the common case)', () => {
			const index = buildIndex('full');
			expect(index.search('kuor')).toContain(1);
			expect(index.search('shirt')).toContain(2);
		});

		it('matches an accentless query against an accented title', () => {
			expect(buildIndex('full').search('cedre')).toContain(3);
		});

		it('matches an NFD query against an NFC-indexed title', () => {
			expect(buildIndex('full').search('Cèdre 2022'.normalize('NFD'))).toContain(3);
		});

		it('matches an NFC query against an NFD-indexed title', () => {
			expect(buildIndex('full').search('Cèdre 2023')).toContain(4);
		});

		it('keeps mid-word substring matching through the custom encoder', () => {
			expect(buildIndex('full').search('teau')).toContain(3);
		});

		it('still enforces minlength through the custom encoder', () => {
			expect(buildIndex('full').search('ce')).toEqual([]);
		});

		it('finds a decimal spec typed on its own', () => {
			// "0.4" used to split into "0" + "4", both under minlength, so it matched nothing.
			expect(buildIndex('full').search('0.4')).toEqual([5]);
		});

		it('ignores punctuation wrapping the typed term', () => {
			expect(buildIndex('full').search("'0.4'")).toEqual([5]);
			expect(buildIndex('full').search('shirt!')).toEqual([2]);
		});

		it('ANDs a model name with a decimal spec down to the one matching product', () => {
			const index = buildIndex('full');
			expect(index.search('modelx').sort()).toEqual([5, 6, 7]);
			expect(index.search('modelx 0.4')).toEqual([5]);
			expect(index.search('modelx 0.6')).toEqual([6]);
			expect(index.search('modelx 0.9')).toEqual([]);
		});

		it('matches inside a punctuated SKU the way LIKE %term% does', () => {
			const index = buildIndex('full');
			expect(index.search('WCP-0001')).toEqual([7]);
			expect(index.search('0001-blk')).toEqual([7]);
			expect(index.search('wcp 0001 blk')).toEqual([7]);
		});

		it('treats punctuation as literal: a hyphenated query does not match a spaced title', () => {
			// wp-admin LIKE '%blue-cotton%' misses "Blue Cotton Shirt" too.
			expect(buildIndex('full').search('blue-cotton')).toEqual([]);
		});

		it('finds a custom-meta barcode after materialization into the grid search field', () => {
			const index = new Index({ preset: 'performance', tokenize: 'full' });
			const barcode = deriveBarcodeFromPayload(
				{ meta_data: [{ key: '_barcode', value: 'CUSTOM-1' }] },
				['meta_data:_barcode']
			);
			if (!barcode) throw new Error('expected a materialized barcode');
			index.add(1, barcode);

			expect(index.search('CUSTOM-1')).toContain(1);
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
