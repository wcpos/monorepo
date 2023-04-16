import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';
import defaults from 'lodash/defaults';
import set from 'lodash/set';
import { BehaviorSubject } from 'rxjs';

type SortDirection = import('@wcpos/components/src/table').SortDirection;

export interface QueryState {
	search?: string;
	sortBy: string;
	sortDirection: SortDirection;
	// filters?: Record<string, unknown>;
	selector?: import('rxdb').MangoQuery['selector'];
	limit?: number;
	skip?: number;
}

export type QueryObservable = BehaviorSubject<QueryState>;

export type SetQuery = (path: import('lodash').PropertyPath, value: any) => void;

function removeNulls(obj) {
	for (const prop in obj) {
		if (obj[prop] === null) {
			delete obj[prop];
		} else if (typeof obj[prop] === 'object') {
			obj[prop] = removeNulls(obj[prop]);
			if (Object.keys(obj[prop]).length === 0) {
				delete obj[prop];
			}
		}
	}
	return obj;
}

function stringifyQuery(query: QueryState): string {
	const sortedKeys = Object.keys(query).sort();
	return JSON.stringify(
		sortedKeys.reduce((sortedQuery, key) => {
			sortedQuery[key] = query[key];
			return sortedQuery;
		}, {})
	);
}

const queryMap = new Map();

/**
 *
 */
const useQuery = (initialQuery: QueryState, queryKey: string) => {
	// Generate a deterministic string representation of the initialQuery
	// const queryKey = stringifyQuery(initialQuery);

	// Check if the queryMap already has a query$ associated with the queryKey
	let query$ = queryMap.get(queryKey);

	// If there's no query$ in the queryMap, create a new one and store it in the map
	if (!query$) {
		// query$ = new BehaviorSubject(defaults(initialQuery, { limit: 10, skip: 0 }));
		query$ = new BehaviorSubject(defaults(initialQuery, {})); // are there any defaults?
		queryMap.set(queryKey, query$);
	}

	/**
	 *
	 */
	const nextPage = React.useCallback(() => {
		const prev = query$.getValue();
		const next = { ...prev, skip: prev.skip + prev.limit };
		query$.next(next);
	}, [query$]);

	/**
	 * Normalize selector, for example:
	 * { selector: { categories: null, tags: { $elemMatch: { id: '123' } } } }
	 * should be { selector: { tags: { $elemMatch: { id: '123' } } } }
	 */
	const setQuery: SetQuery = React.useCallback(
		(path, value) => {
			const prev = cloneDeep(query$.getValue()); // query needs to be immutable
			const next = removeNulls(set(prev, path, value));
			query$.next(next);
		},
		[query$]
	);

	return { query$, setQuery, nextPage };
};

export default useQuery;
