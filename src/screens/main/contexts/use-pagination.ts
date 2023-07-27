import * as React from 'react';

import { useObservableRef, useObservable } from 'observable-hooks';
import { Observable, combineLatest } from 'rxjs';
import { map, tap } from 'rxjs/operators';

import type { RxDocument } from 'rxdb';

interface UsePagination {
	data$: Observable<RxDocument[]>;
	pageSize?: number;
}

/**
 * Take a data$ observable and return a paginated stream
 */
const usePagination = ({ data$, pageSize = 10 }: UsePagination) => {
	const pageNumberRef = React.useRef(1);
	const [loadMoreRef, loadMore$] = useObservableRef(Date.now());

	/**
	 *
	 */
	const paginatedData$ = useObservable(
		() =>
			combineLatest([data$, loadMore$]).pipe(
				map(([docs, trigger]) => {
					const count = docs.length;
					const page = pageNumberRef.current;
					const result = {
						data: docs.slice(0, page * pageSize),
						count,
						hasMore: count > page * pageSize,
					};
					pageNumberRef.current += 1;
					return result;
				})
			),
		[]
	);

	/**
	 *
	 */
	const loadNextPage = React.useCallback(() => {
		loadMoreRef.current = Date.now();
	}, [loadMoreRef]);

	/**
	 *
	 */
	return { paginatedData$, loadNextPage };
};

export default usePagination;
