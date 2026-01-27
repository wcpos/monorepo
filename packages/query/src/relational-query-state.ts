import isEmpty from 'lodash/isEmpty';
import union from 'lodash/union';
import { combineLatest, from, Observable } from 'rxjs';
import { map, startWith, switchMap } from 'rxjs/operators';

import { getLogger } from '@wcpos/utils/logger';

import { Query } from './query-state';

const relationalLogger = getLogger(['wcpos', 'query', 'relational']);

import type { QueryConfig } from './query-state';
import type { RxCollection, RxDocument } from 'rxdb';

type DocumentType<C> = C extends RxCollection<infer D> ? RxDocument<D, object> : never;

/**
 * Counts of matching children grouped by parent ID
 * Example: { 123: 5, 456: 2 } means parent 123 has 5 matching children
 */
type ChildCountsByParent = Record<number, number>;

/**
 * Result of relational search combining parent and child results
 */
interface RelationalSearchResult {
	/** UUIDs of parents that matched via child search */
	parentUUIDs: string[];
	/** Count of matching children for each parent */
	countsByParent: ChildCountsByParent;
}

/**
 * RelationalQuery extends Query to support parent-child relationships.
 *
 * Use Case: Products with Variations
 * When searching, we want to show:
 * 1. Products that match the search term directly (parent search)
 * 2. Products whose variations match the search term (child search)
 * 3. Count of matching variations per product (for display)
 *
 * Architecture:
 * ```
 * RelationalQuery (parent: products)
 *   ├── childQuery (variations) - searches children
 *   └── parentLookupQuery (products) - converts child parent_ids to parent UUIDs
 * ```
 *
 * Data Flow:
 * ```
 * search("blue")
 *   ├── parentSearch("blue") → [uuid1, uuid2]  (direct matches)
 *   └── relationalSearch("blue")
 *       ├── childSearch("blue") → { 123: 2, 456: 1 }  (parent_id → count)
 *       └── parentLookup([123, 456]) → [uuid3, uuid4]  (id → uuid)
 *   └── combine → [uuid1, uuid2, uuid3, uuid4] + counts
 * ```
 */
export class RelationalQuery<T extends RxCollection> extends Query<T> {
	/**
	 * Query for child collection (e.g., variations)
	 * Must have documents with `parent_id` field
	 */
	private readonly childQuery: Query<any>;

	/**
	 * Query for looking up parent UUIDs by ID
	 * Used to convert parent_ids from children to UUIDs
	 */
	private readonly parentLookupQuery: Query<T>;

	constructor(config: QueryConfig<T>, childQuery: Query<any>, parentLookupQuery: Query<T>) {
		super(config);
		this.childQuery = childQuery;
		this.parentLookupQuery = parentLookupQuery;
	}

	/**
	 * Override search to combine parent and child search results.
	 *
	 * When searching:
	 * 1. Direct parent matches (products matching "blue")
	 * 2. Parents of matching children (products with variations matching "blue")
	 * 3. Track child match counts per parent (for UI display)
	 */
	override search(searchTerm: string): void {
		// Clear search: remove filters and cancel subscriptions
		if (isEmpty(searchTerm)) {
			this.clearRelationalSearch();
			return;
		}

		this.resetPagination();
		this.startRelationalSearch(searchTerm);
	}

	/**
	 * Clear relational search state and filters
	 */
	private clearRelationalSearch(): void {
		relationalLogger.debug('Clearing relational search', {
			context: { id: this.id, collection: this.collection.name },
		});
		this.currentRxQuery.other.relationalSearch = null;
		this.removeWhere(this.primaryKey).exec();
		this.cancelSub('relational-search');
	}

	/**
	 * Start relational search by combining parent and child results
	 */
	private startRelationalSearch(searchTerm: string): void {
		relationalLogger.debug('Starting relational search', {
			context: { id: this.id, searchTerm },
		});

		this.addSub(
			'relational-search',
			combineLatest([
				this.searchParentsDirect(searchTerm),
				this.searchParentsViaChildren(searchTerm),
			]).subscribe(([directMatchUUIDs, childMatchResult]) => {
				this.applySearchResults(searchTerm, directMatchUUIDs, childMatchResult);
			})
		);
	}

	/**
	 * Apply combined search results to the query
	 */
	private applySearchResults(
		searchTerm: string,
		directMatchUUIDs: string[],
		childMatchResult: RelationalSearchResult
	): void {
		const { parentUUIDs: childMatchUUIDs, countsByParent } = childMatchResult;
		const allMatchingUUIDs = union(directMatchUUIDs, childMatchUUIDs);

		relationalLogger.debug('Relational search results', {
			context: {
				id: this.id,
				searchTerm,
				directMatches: directMatchUUIDs.length,
				childMatches: childMatchUUIDs.length,
				totalMatches: allMatchingUUIDs.length,
				parentsWithChildren: Object.keys(countsByParent).length,
			},
		});

		// Don't reset pagination when updating search results
		this.where(this.primaryKey).in(allMatchingUUIDs, false);

		// Store search metadata for result processing
		this.currentRxQuery.other.relationalSearch = {
			searchTerm,
			countsByParent,
		};

		this.exec();
	}

	/**
	 * Search parents directly using the search index.
	 *
	 * Note: Uses searchInstance directly, not this.search(),
	 * to avoid conflicting with the relational-search subscription.
	 *
	 * @returns Observable<string[]> - UUIDs of directly matching parents
	 */
	private searchParentsDirect(searchTerm: string): Observable<string[]> {
		return from(this.searchInstancePromise).pipe(
			switchMap((searchInstance) =>
				// Re-run search when search collection changes
				searchInstance.collection.$.pipe(
					startWith(null),
					switchMap(() => searchInstance.find(searchTerm))
				)
			),
			map((documents: DocumentType<T>[]) => documents.map(({ uuid }) => uuid))
		);
	}

	/**
	 * Find parents by searching their children.
	 *
	 * Flow:
	 * 1. Search children → get parent_ids with match counts
	 * 2. Lookup parents → convert parent_ids to UUIDs
	 *
	 * @returns Observable<RelationalSearchResult>
	 */
	private searchParentsViaChildren(searchTerm: string): Observable<RelationalSearchResult> {
		return this.getChildMatchCounts(searchTerm).pipe(
			switchMap((countsByParent) => {
				const parentIds = Object.keys(countsByParent).map(Number);
				return this.lookupParentUUIDs(parentIds).pipe(
					map((parentUUIDs) => ({
						parentUUIDs,
						countsByParent,
					}))
				);
			})
		);
	}

	/**
	 * Search children and count matches per parent.
	 *
	 * Side effect: Triggers childQuery.search() to update its results.
	 *
	 * @returns Observable<ChildCountsByParent> - { parent_id: count }
	 */
	private getChildMatchCounts(searchTerm: string): Observable<ChildCountsByParent> {
		// Start child search (side effect)
		this.childQuery.search(searchTerm);

		// Stream child results and aggregate by parent
		return this.childQuery.result$.pipe(
			map((results) => {
				return results.hits.reduce<ChildCountsByParent>((acc, { document }) => {
					const parentId = document?.parent_id;
					if (parentId) {
						acc[parentId] = (acc[parentId] || 0) + 1;
					}
					return acc;
				}, {});
			})
		);
	}

	/**
	 * Convert parent IDs to parent UUIDs.
	 *
	 * Side effect: Triggers parentLookupQuery.exec() to fetch parents.
	 *
	 * @returns Observable<string[]> - Parent UUIDs
	 */
	private lookupParentUUIDs(parentIds: number[]): Observable<string[]> {
		// Update lookup query with parent IDs (side effect)
		this.parentLookupQuery.where('id').in(parentIds).exec();

		// Stream lookup results
		return this.parentLookupQuery.result$.pipe(
			map((results) => results.hits.map(({ id }) => id))
		);
	}
}
