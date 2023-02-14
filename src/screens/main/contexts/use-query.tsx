import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';
import set from 'lodash/set';
import { BehaviorSubject } from 'rxjs';

type SortDirection = import('@wcpos/components/src/table').SortDirection;

export interface QueryState {
	search?: string;
	sortBy: string;
	sortDirection: SortDirection;
	filters?: Record<string, unknown>;
}

export type QueryObservable = BehaviorSubject<QueryState>;

export type SetQuery = (path: import('lodash').PropertyPath, value: any) => void;

/**
 *
 */
const useQuery = (initialQuery: QueryState) => {
	/**
	 *
	 */
	const query$ = React.useMemo(() => new BehaviorSubject(initialQuery), [initialQuery]);

	/**
	 *
	 */
	const setQuery: SetQuery = React.useCallback(
		(path, value) => {
			const prev = cloneDeep(query$.getValue()); // query needs to be immutable
			const next = set(prev, path, value);
			query$.next(next);
		},
		[query$]
	);

	return { query$, setQuery };
};

export default useQuery;
