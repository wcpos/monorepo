import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';
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

/**
 *
 */
const useQuery = (initialQuery: QueryState) => {
	/**
	 *
	 */
	const query$ = React.useMemo(() => new BehaviorSubject(initialQuery), [initialQuery]);

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

	return { query$, setQuery };
};

export default useQuery;
