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

/**
 *
 */
const useQuery = (initialQuery: QueryState) => {
	// // are there any defaults?
	const [query$] = React.useState(() => new BehaviorSubject(defaults(initialQuery, {})));

	/**
	 * Not currently used, but maybe I should only be getting a limit from the DB?
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
