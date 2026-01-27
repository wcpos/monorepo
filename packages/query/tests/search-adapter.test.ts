import type { RxDatabase } from 'rxdb';

import { createStoreDatabase } from './helpers/db';
import { SearchAdapter } from '../src/search-adapter';

// Mock the logger module
jest.mock('@wcpos/utils/src/logger');

describe('SearchAdapter', () => {
	let storeDatabase: RxDatabase;

	beforeEach(async () => {
		storeDatabase = await createStoreDatabase();
	});

	afterEach(async () => {
		if (storeDatabase && !storeDatabase.destroyed) {
			await storeDatabase.remove();
		}
		jest.clearAllMocks();
	});

	describe('Initialization', () => {
		it('should create adapter with correct initial state', () => {
			const adapter = new SearchAdapter(
				storeDatabase.collections.products,
				'uuid',
				'en'
			);

			expect(adapter.isSearchActive).toBe(false);
			expect(adapter.currentSearchTerm).toBe('');

			adapter.destroy();
		});

		it('should have search$ observable', () => {
			const adapter = new SearchAdapter(
				storeDatabase.collections.products,
				'uuid',
				'en'
			);

			expect(adapter.search$).toBeDefined();
			expect(typeof adapter.search$.subscribe).toBe('function');

			adapter.destroy();
		});

		it('should have searchCleared$ observable', () => {
			const adapter = new SearchAdapter(
				storeDatabase.collections.products,
				'uuid',
				'en'
			);

			expect(adapter.searchCleared$).toBeDefined();
			expect(typeof adapter.searchCleared$.subscribe).toBe('function');

			adapter.destroy();
		});
	});

	describe('Search State', () => {
		it('should update isSearchActive when search is called', () => {
			const adapter = new SearchAdapter(
				storeDatabase.collections.products,
				'uuid',
				'en'
			);

			expect(adapter.isSearchActive).toBe(false);

			adapter.search('test');

			expect(adapter.isSearchActive).toBe(true);
			expect(adapter.currentSearchTerm).toBe('test');

			adapter.destroy();
		});

		it('should clear search when empty string is passed', () => {
			const adapter = new SearchAdapter(
				storeDatabase.collections.products,
				'uuid',
				'en'
			);

			adapter.search('test');
			expect(adapter.isSearchActive).toBe(true);

			adapter.search('');

			expect(adapter.isSearchActive).toBe(false);
			expect(adapter.currentSearchTerm).toBe('');

			adapter.destroy();
		});

		it('should emit on searchCleared$ when search is cleared', (done) => {
			const adapter = new SearchAdapter(
				storeDatabase.collections.products,
				'uuid',
				'en'
			);

			const sub = adapter.searchCleared$.subscribe(() => {
				expect(adapter.isSearchActive).toBe(false);
				sub.unsubscribe(); // Unsubscribe before destroy to prevent double emission
				adapter.destroy();
				done();
			});

			adapter.search('test');
			adapter.clearSearch();
		});
	});

	describe('Debounced Search', () => {
		it('should have debouncedSearch method', () => {
			const adapter = new SearchAdapter(
				storeDatabase.collections.products,
				'uuid',
				'en'
			);

			expect(typeof adapter.debouncedSearch).toBe('function');

			adapter.destroy();
		});
	});

	describe('Cleanup', () => {
		it('should complete observables on destroy', (done) => {
			const adapter = new SearchAdapter(
				storeDatabase.collections.products,
				'uuid',
				'en'
			);

			adapter.search$.subscribe({
				complete: () => {
					done();
				},
			});

			adapter.destroy();
		});

		it('should clear search state on destroy', () => {
			const adapter = new SearchAdapter(
				storeDatabase.collections.products,
				'uuid',
				'en'
			);

			adapter.search('test');
			expect(adapter.isSearchActive).toBe(true);

			adapter.destroy();

			expect(adapter.isSearchActive).toBe(false);
		});
	});
});
