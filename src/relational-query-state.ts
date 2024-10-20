import _groupBy from 'lodash/groupBy';
import _map from 'lodash/map';
import _maxBy from 'lodash/maxBy';
import _unionBy from 'lodash/unionBy';
import { combineLatest, from } from 'rxjs';
import { map, switchMap, filter, startWith, tap } from 'rxjs/operators';

import { Query, QueryParams } from './query-state';

import type { QueryConfig } from './query-state';
import type { RxCollection } from 'rxdb';

/**
 * Extend the search results of Query with relational results
 */
export class RelationalQuery<T extends RxCollection> extends Query<T> {
	private childQuery: Query<any>;
	private parentLookupQuery: Query<T>;
	private childSearchInstance: any;

	constructor(config: QueryConfig<T>, childQuery: Query<any>, parentLookupQuery: Query<T>) {
		super(config);
		this.childQuery = childQuery;
		this.parentLookupQuery = parentLookupQuery;
		this.childSearchInstance = childQuery.collection.initSearch(config.locale);
	}

	/**
	 *
	 */
	override handleSearchActive(modifiedParams: QueryParams) {
		return combineLatest([
			this.parentSearch(modifiedParams),
			this.childSearch(modifiedParams),
		]).pipe(
			switchMap(([searchResults, childSearchData]) => {
				const { parentDocs: additionalSearchResults, countsByParent } = childSearchData;

				const uuids = _unionBy(searchResults, additionalSearchResults, 'uuid').map(
					(doc) => doc.uuid
				);
				const selector = modifiedParams.selector || {};
				selector.uuid = { $in: uuids };
				return this.collection.find({ selector }).$.pipe(
					map((docs) => {
						const sortedDocs = uuids
							.map((uuid) => docs.find((doc) => doc.uuid === uuid))
							.filter((doc) => doc !== undefined);

						return {
							searchActive: true,
							searchTerm: modifiedParams.search,
							count: sortedDocs.length,
							hits: sortedDocs.map((doc) => ({
								id: doc.uuid,
								document: doc,
								childrenSearchCount: countsByParent[doc.id] || 0,
							})),
						};
					})
				);
			})
		);
	}

	/**
	 *
	 */
	parentSearch(modifiedParams) {
		return from(this.searchInstancePromise).pipe(
			switchMap((searchInstance) =>
				searchInstance.collection.$.pipe(
					startWith(null),
					switchMap(() => searchInstance.find(modifiedParams.search))
				)
			)
		);
	}

	/**
	 *
	 */
	childSearch(modifiedParams) {
		return from(this.childSearchInstance).pipe(
			switchMap((searchInstance) =>
				searchInstance.collection.$.pipe(
					startWith(null),
					switchMap(() => searchInstance.find(modifiedParams.search))
				)
			),
			switchMap((searchResults) => {
				const countsByParent = searchResults.reduce((acc, result) => {
					const parentId = result.parent_id;
					acc[parentId] = (acc[parentId] || 0) + 1;
					return acc;
				}, {});
				const parentIds = Object.keys(countsByParent).map(Number);
				return this.collection.find({ selector: { id: { $in: parentIds } } }).$.pipe(
					map((parentDocs) => ({
						parentDocs,
						countsByParent,
					}))
				);
			})
		);
	}
}
