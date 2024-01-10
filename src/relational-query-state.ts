import _groupBy from 'lodash/groupBy';
import _map from 'lodash/map';
import _maxBy from 'lodash/maxBy';
import { combineLatest, of } from 'rxjs';
import { map, switchMap, filter, tap } from 'rxjs/operators';

import { Query, QueryParams } from './query-state';

import type { QueryConfig } from './query-state';
import type { RxCollection } from 'rxdb';

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
	override handleSearchActive(modifiedParams: QueryParams) {
		const startTime = performance.now(); // Start time measurement

		return combineLatest([
			this.searchService.search$(modifiedParams.search as string),
			this.handleRelationalSearch(modifiedParams),
		]).pipe(
			switchMap(([searchResults, additionalSearchResults]) => {
				return this.collection.find({ selector: modifiedParams?.selector || {} }).$.pipe(
					map((docs) => {
						if (additionalSearchResults) {
							const combinedHits = [...searchResults.hits, ...additionalSearchResults.hits];
							const uniqueHits = Array.from(
								new Map(combinedHits.map((hit) => [hit.id, hit])).values()
							);
							uniqueHits.sort((a, b) => b.score - a.score);
							searchResults.count = uniqueHits.length;
							searchResults.hits = uniqueHits;
							// console.log('searchResults', searchResults);
						}
						const filteredAndSortedDocs = searchResults.hits
							.map((hit) => ({
								...hit,
								document: docs.find((doc) => doc[this.primaryKey] === hit.id),
							}))
							.filter((hit) => hit.document !== undefined);

						const endTime = performance.now(); // End time measurement
						const elapsed = endTime - startTime;

						return {
							elapsed,
							searchActive: true,
							searchTerm: modifiedParams.search,
							count: filteredAndSortedDocs.length,
							hits: filteredAndSortedDocs,
						};
					})
				);
			})
			// distinctUntilChanged((prev, next) => {
			// 	// Check if search is active and searchTerm has changed
			// 	if (prev.searchActive !== next.searchActive || prev.searchTerm !== next.searchTerm) {
			// 		return false;
			// 	}

			// 	// Check if the number of hits or their order has changed
			// 	const idsAreEqual = _isEqual(
			// 		prev.hits.map((hit) => hit.id),
			// 		next.hits.map((hit) => hit.id)
			// 	);

			// 	// if search is active, check if the childrenSearchCount has changed
			// 	let childrenAreEqual = true;
			// 	if (idsAreEqual && next.searchActive) {
			// 		childrenAreEqual = prev.hits.every((hit, index) => {
			// 			const nextHit = next.hits[index];
			// 			return (
			// 				hit.parentSearchTerm === nextHit.parentSearchTerm &&
			// 				hit.childrenSearchCount === nextHit.childrenSearchCount &&
			// 				hit.score === nextHit.score
			// 			);
			// 		});
			// 	}

			// 	return idsAreEqual && childrenAreEqual;
			// })
		);
	}

	/**
	 * Do the child search and then do a lookup on the parent
	 * Note; result$ is optimized to only emit certain changes, so we subscribe to find$ directly
	 */
	handleRelationalSearch(modifiedParams: QueryParams) {
		this.childQuery.search(modifiedParams.search);

		return this.childQuery.find$.pipe(
			filter((result) => result.searchActive),
			switchMap((childResult) => {
				console.log('childResult', childResult);

				const scoreIdPairs = childResult.hits.map(({ document, score }) => ({
					score,
					parent_id: document.parent_id,
				}));

				const groupedById = _groupBy(scoreIdPairs, 'parent_id');

				const averagedScores = _map(groupedById, (values, key) => ({
					parent_id: parseInt(key, 10),
					averageScore: _maxBy(values, 'score')?.score || 0,
					childrenSearchCount: values.length, // Count of childQuery hits for this parent_id
				}));

				const parentIds = averagedScores
					.map(({ parent_id }) => parent_id)
					.filter((id) => !isNaN(id));

				/**
				 *
				 */
				this.parentLookupQuery.where('id', { $in: parentIds });
				return combineLatest([of(averagedScores), this.parentLookupQuery.find$]).pipe(
					tap((res) => console.log('res', res)),
					map(([averagedScores, parentLookupResult]) => {
						const parentLookupWithScore = {
							...parentLookupResult,
							hits: parentLookupResult.hits.map((hit) => {
								const averageScoreEntry = averagedScores.find(
									(scoreEntry) => scoreEntry.parent_id === hit.document.id
								);
								return {
									...hit,
									score: averageScoreEntry ? averageScoreEntry.averageScore : hit.score,
									childrenSearchCount: averageScoreEntry
										? averageScoreEntry.childrenSearchCount
										: 0,
									parentSearchTerm: modifiedParams.search,
								};
							}),
						};

						console.log('parentLookupWithScore', parentLookupWithScore);
						return parentLookupWithScore;
					})
				);
			})
		);
	}
}
