import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import isEmpty from 'lodash/isEmpty';
import { useObservable } from 'observable-hooks';
import { of } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';

import type { QueryObservable } from '../use-query';
import type { RxCollection, RxDocument } from 'rxdb';

/**
 * Queries local data and returns a stream of sorted data
 */
const useLocalDataQuery = ({
	query$,
	collection,
}: {
	query$: QueryObservable;
	collection: RxCollection;
}) => {
	/**
	 *
	 */
	const queryData$ = useObservable(
		() =>
			query$.pipe(
				switchMap((query) => {
					// if string search we need to do that first to get the matching uuids
					if (!isEmpty(query.search) && typeof query.search === 'string') {
						return collection.search$(query.search).pipe(
							map(({ hits }) => hits.map((obj) => obj.id)),
							/**
							 * combine uuids with original selector
							 */
							map((searchIds) => {
								const searchSelector = {
									uuid: { $in: searchIds },
								};
								const selector = query.selector
									? {
											$and: [query.selector, searchSelector],
									  }
									: searchSelector;

								return { ...query, selector };
							})
						);
					}

					// else just return the original query
					return of(query);
				}),
				switchMap(({ selector, sortBy = 'id', sortDirection = 'asc' }) => {
					const RxQuery = collection.find({ selector });

					return RxQuery.$.pipe(
						map((result: RxDocument[]) => {
							return orderBy(result, [sortBy], [sortDirection]);
						})
						// distinctUntilChanged((prev, next) => {
						// 	// only emit when the uuids change
						// 	return isEqual(
						// 		prev.map((doc) => doc.uuid),
						// 		next.map((doc) => doc.uuid)
						// 	);
						// })
					);
				})
			),
		[]
	);

	/**
	 *
	 */
	return { queryData$ };
};

export default useLocalDataQuery;
