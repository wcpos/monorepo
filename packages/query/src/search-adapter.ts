import debounce from 'lodash/debounce';
import isEmpty from 'lodash/isEmpty';
import { from, Subject, Subscription } from 'rxjs';
import { startWith, switchMap, takeUntil } from 'rxjs/operators';

import type { RxCollection, RxQuery } from 'rxdb';

type DocumentType<C> = C extends RxCollection<infer D> ? D : never;

export interface SearchResult<T> {
	searchTerm: string;
	uuids: string[];
}

/**
 * SearchAdapter handles search functionality for a Query.
 *
 * Responsibilities:
 * - Managing search subscriptions
 * - Communicating with the collection's search instance
 * - Emitting search results to the parent Query
 *
 * Usage:
 * ```ts
 * const adapter = new SearchAdapter(collection, primaryKey, locale);
 * adapter.search$.subscribe(result => {
 *   // Update query with result.uuids
 * });
 * adapter.search('term');
 * ```
 */
export class SearchAdapter<T extends RxCollection> {
	private readonly collection: T;
	private readonly primaryKey: string;
	private readonly searchInstancePromise: Promise<any>;
	private readonly destroy$ = new Subject<void>();

	private currentSubscription: Subscription | null = null;
	private _isSearchActive = false;
	private _currentSearchTerm = '';

	/**
	 * Emits search results when search completes
	 */
	public readonly search$ = new Subject<SearchResult<T>>();

	/**
	 * Emits when search is cleared
	 */
	public readonly searchCleared$ = new Subject<void>();

	constructor(collection: T, primaryKey: string, locale: string) {
		this.collection = collection;
		this.primaryKey = primaryKey;
		this.searchInstancePromise = collection.initSearch(locale);
	}

	/**
	 * Check if search is currently active
	 */
	get isSearchActive(): boolean {
		return this._isSearchActive;
	}

	/**
	 * Get current search term
	 */
	get currentSearchTerm(): string {
		return this._currentSearchTerm;
	}

	/**
	 * Execute a search query
	 */
	search(searchTerm: string): void {
		// If search term is empty, clear the search
		if (isEmpty(searchTerm)) {
			this.clearSearch();
			return;
		}

		this._isSearchActive = true;
		this._currentSearchTerm = searchTerm;

		// Cancel previous subscription
		if (this.currentSubscription) {
			this.currentSubscription.unsubscribe();
		}

		this.currentSubscription = from(this.searchInstancePromise)
			.pipe(
				takeUntil(this.destroy$),
				switchMap((searchInstance) =>
					// Update search results when the search collection changes
					searchInstance.collection.$.pipe(
						startWith(null),
						switchMap(() => searchInstance.find(searchTerm))
					)
				)
			)
			.subscribe((results: DocumentType<T>[]) => {
				const uuids = results.map((result) => result[this.primaryKey]);
				this.search$.next({
					searchTerm,
					uuids,
				});
			});
	}

	/**
	 * Debounced search (250ms default)
	 */
	debouncedSearch = debounce((searchTerm: string) => this.search(searchTerm), 250);

	/**
	 * Clear the current search
	 */
	clearSearch(): void {
		if (this.currentSubscription) {
			this.currentSubscription.unsubscribe();
			this.currentSubscription = null;
		}

		this._isSearchActive = false;
		this._currentSearchTerm = '';
		this.searchCleared$.next();
	}

	/**
	 * Destroy the adapter and cleanup subscriptions
	 */
	destroy(): void {
		this.clearSearch();
		this.destroy$.next();
		this.destroy$.complete();
		this.search$.complete();
		this.searchCleared$.complete();
	}
}
