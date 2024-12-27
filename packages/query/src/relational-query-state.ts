import isEmpty from 'lodash/isEmpty';
import union from 'lodash/union';
import { combineLatest, from } from 'rxjs';
import { map, switchMap, startWith } from 'rxjs/operators';

import { Query } from './query-state';

import type { QueryConfig } from './query-state';
import type { RxCollection, RxDocument } from 'rxdb';
type DocumentType<C> = C extends RxCollection<infer D> ? RxDocument<D, object> : never;

/**
 * Extend the search results of Query with relational results
 */
export class RelationalQuery<T extends RxCollection> extends Query<T> {
	private childQuery: Query<any>;
	private parentLookupQuery: Query<T>;

	constructor(config: QueryConfig<T>, childQuery: Query<any>, parentLookupQuery: Query<T>) {
		super(config);
		this.childQuery = childQuery;
		this.parentLookupQuery = parentLookupQuery;
	}

	/**
	 *
	 */
	override search(searchTerm: string) {
		// If the search term is empty, remove the uuid filter and unsubscribe from the search
		if (isEmpty(searchTerm)) {
			this.currentRxQuery.other.relationalSearch = null;
			this.removeWhere(this.primaryKey).exec();
			this.cancelSub('relational-search');
			return;
		}

		this.resetPagination();

		this.addSub(
			'relational-search',
			combineLatest([this.parentSearch(searchTerm), this.relationalSearch(searchTerm)]).subscribe(
				([parentSearchUUIDs, childSearchData]) => {
					const { parentUUIDs: childSearchResults, countsByParent } = childSearchData;
					const uuids = union(parentSearchUUIDs, childSearchResults);

					/**
					 * @NOTE - don't reset the pagination when we're getting search updates
					 */
					this.where(this.primaryKey).in(uuids, false);
					this.currentRxQuery.other.relationalSearch = {
						searchTerm,
						countsByParent,
					};
					this.exec();
				},
			),
		);
	}

	/**
	 * @NOTE - parentSearch does a direct search via the searchInstance
	 * - it does't not use this.search because that would conflict with 'relational-search'
	 * - when 'relational-search' is triggered, it will update the params and trigger a query replication
	 */
	parentSearch(searchTerm: string) {
		return from(this.searchInstancePromise).pipe(
			switchMap((searchInstance) =>
				searchInstance.collection.$.pipe(
					// Note, I want to update search results when the search collection changes
					// I don't know if this is the best way
					startWith(null),
					switchMap(() => searchInstance.find(searchTerm)),
				),
			),
			map((documents: DocumentType<T>[]) => documents.map(({ uuid }) => uuid)),
		);
	}

	/**
	 * Child search will return an object with parent uuids and child counts
	 */
	relationalSearch(searchTerm: string) {
		return this.childSearch(searchTerm).pipe(
			switchMap((countsByParent) => {
				const parentIds = Object.keys(countsByParent).map(Number);
				return this.parentLookup(parentIds).pipe(
					map((uuids) => ({
						parentUUIDs: uuids,
						countsByParent,
					})),
				);
			}),
		);
	}

	/**
	 * Child search will return a map of parent ids to counts
	 */
	childSearch(searchTerm: string) {
		const obs$ = this.childQuery.result$.pipe(
			map((results) => {
				return results.hits.reduce((acc, { document }) => {
					const parentId = document?.parent_id;
					if (parentId) {
						acc[parentId] = (acc[parentId] || 0) + 1;
					}
					return acc;
				}, {});
			}),
		);
		this.childQuery.search(searchTerm);
		return obs$;
	}

	/**
	 * Parent lookup will take a list of parent ids and return a list of parent uuids
	 */
	parentLookup(parentIds: number[]) {
		const obs$ = this.parentLookupQuery.result$.pipe(
			map((results) => results.hits.map(({ id }) => id)),
		);
		this.parentLookupQuery.where('id').in(parentIds).exec();
		return obs$;
	}
}
