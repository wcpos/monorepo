import * as React from 'react';

import debounce from 'lodash/debounce';
import isEqual from 'lodash/isEqual';
import set from 'lodash/set';
import { useObservableRef } from 'observable-hooks';

import type { BehaviorSubject } from 'rxjs';

type SortDirection = import('@wcpos/components/src/table').SortDirection;

export interface QueryState {
	search?: string | Record<string, any>;
	sortBy: string;
	sortDirection: SortDirection;
	selector?: import('rxdb').MangoQuery['selector'];
	// limit?: number;
	// skip?: number;
}

export type QueryObservable = BehaviorSubject<QueryState>;
export type SetQuery = (path: ((prev: QueryState) => QueryState) | string, value?: any) => void;

/**
 * Recursively removes all properties with `null` values from an object.
 * Modifies the input object directly.
 */
function removeNulls(obj: any): QueryState {
	for (const prop in obj) {
		if (obj[prop] === null) {
			delete obj[prop];
		} else if (typeof obj[prop] === 'object') {
			obj[prop] = removeNulls(obj[prop]);
		}
	}
	return obj as QueryState;
}

/**
 * Custom React hook to manage query state for a collection context.
 * The query state is stored in a ref to avoid causing re-renders when the query changes.
 * The hook returns an object with properties `query`, `query$`, `setQuery`, and `setDebouncedQuery`.
 */
const useQuery = (initialQuery: QueryState) => {
	const [query, query$] = useObservableRef<QueryState>(initialQuery);

	/**
	 * Synchronizes the current query state with the initial query state.
	 *
	 * This effect runs whenever `initialQuery` or `query` changes. If the current
	 * `query` is not deep-equal to `initialQuery`, the `query` is updated to
	 * match `initialQuery`.
	 *
	 * This is necessary when `query` state needs to be controlled or reset by a
	 * parent component or in response to changes in other variables.
	 */
	React.useEffect(() => {
		if (!isEqual(query.current, initialQuery)) {
			query.current = initialQuery;
		}
	}, [initialQuery, query]);

	/**
	 * Sets the query state. Accepts either a callback function that receives the current query state
	 * and returns the new state, or a path and value to set a specific property of the query state.
	 */
	const setQuery = React.useCallback(
		(path: ((prev: QueryState) => QueryState) | string, value?: any) => {
			let newValue: QueryState;

			if (typeof path === 'function') {
				newValue = path(query.current);
			} else if (value !== undefined) {
				newValue = set({ ...query.current }, path, value);
			} else {
				// @TODO - should I allow direct setting of query object?
				throw new Error('Invalid arguments for setQuery');
			}

			query.current = removeNulls(newValue);
		},
		[query]
	);

	/**
	 * Debounced version of `setQuery`. Debounces calls to `setQuery` by 250ms.
	 */
	const setDebouncedQuery = React.useCallback(
		debounce(
			(path: ((prev: QueryState) => QueryState) | string, value?: any) => setQuery(path, value),
			250
		),
		[setQuery]
	);

	return { query$, setQuery, setDebouncedQuery };
};

export default useQuery;
