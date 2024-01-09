import * as React from 'react';

import _groupBy from 'lodash/groupBy';
import _map from 'lodash/map';
import _maxBy from 'lodash/maxBy';
import { useObservableState, useSubscription } from 'observable-hooks';
import { combineLatest, of } from 'rxjs';
import { distinctUntilChanged, map, tap, filter, switchMap } from 'rxjs/operators';

import { useQueryManager } from './provider';

import type { QueryOptions } from './use-query';

export const useRelationalQuery = (parentOptions: QueryOptions, childOptions: QueryOptions) => {
	const queryManager = useQueryManager();
	const parentQuery = queryManager.registerQuery(parentOptions);
	const childQuery = queryManager.registerQuery(childOptions);
	const parentLookupQuery = queryManager.registerQuery({
		...parentOptions,
		queryKeys: [...parentOptions.queryKeys, 'parentLookup'],
		initialParams: {
			selector: {
				id: { $in: [] },
			},
		},
	});

	useSubscription(
		parentQuery.params$.pipe(
			switchMap((parentParams) => {
				childQuery.search(parentParams.search);
				return childQuery.result$.pipe(
					filter((result) => result.searchActive),
					switchMap((childResult) => {
						const scoreIdPairs = childResult.hits.map(({ document, score }) => ({
							score,
							parent_id: document.parent_id,
						}));

						const groupedById = _groupBy(scoreIdPairs, 'parent_id');

						const averagedScores = _map(groupedById, (values, key) => ({
							parent_id: parseInt(key, 10),
							averageScore: _maxBy(values, 'score')?.score || 0,
						}));

						const parentIds = averagedScores
							.map(({ parent_id }) => parent_id)
							.filter((id) => !isNaN(id));
						parentLookupQuery.where('id', { $in: parentIds });
						return combineLatest([of(averagedScores), parentLookupQuery.result$]);
					}),
					map(([averagedScores, parentLookupResult]) => {
						const parentLookupWithScore = {
							...parentLookupResult,
							hits: parentLookupResult.hits.map((hit) => {
								const averageScoreEntry = averagedScores.find(
									(scoreEntry) => scoreEntry.parent_id === hit.document.id
								);
								return {
									...hit,
									score: averageScoreEntry ? averageScoreEntry.averageScore : null,
									hasChildren: true,
									parentSearchTerm: parentParams.search,
								};
							}),
						};
						console.log('parentLookupWithScore', parentLookupWithScore);
						parentQuery.subjects.additionalSearchResults.next(parentLookupWithScore);
					})
				);
			})
		)
	);

	/**
	 * This is a hack for when when collection is reset:
	 * - re-render components that use this query
	 * - on re-render the query is recreated
	 */
	const trigger = useObservableState(parentQuery.cancel$.pipe(map(() => trigger + 1)), 0);

	return { parentQuery, childQuery, parentLookupQuery };
};
