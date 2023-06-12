import * as React from 'react';

import cloneDeep from 'lodash/cloneDeep';
import debounce from 'lodash/debounce';
import defaults from 'lodash/defaults';
import set from 'lodash/set';
import { BehaviorSubject } from 'rxjs';
import useDeepCompareEffect from 'use-deep-compare-effect';

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

export type SetQuery = (
	path: import('lodash').PropertyPath,
	value: any,
	debounce?: boolean
) => void;

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
	const query$ = React.useRef(new BehaviorSubject(defaults(initialQuery, {})));
	// const [query$] = React.useState(() => new BehaviorSubject(defaults(initialQuery, {})));

	// Use useDeepCompareEffect to listen for changes in initialQuery
	useDeepCompareEffect(() => {
		query$.current.next(defaults(initialQuery, {}));
	}, [initialQuery, query$]);

	/**
	 * Not currently used, but maybe I should only be getting a limit from the DB?
	 */
	const nextPage = React.useCallback(() => {
		const prev = query$.current.getValue();
		const next = { ...prev, skip: prev.skip + prev.limit };
		query$.current.next(next);
	}, [query$]);

	/**
	 * Normalize selector, for example:
	 * { selector: { categories: null, tags: { $elemMatch: { id: '123' } } } }
	 * should be { selector: { tags: { $elemMatch: { id: '123' } } } }
	 *
	 * TODO - fix the setQuery .. maybe have a setQueryPath? or setQueryValue?
	 * This should not be different to initialQuery argument
	 */
	const updateQuery = React.useCallback(
		(path, value) => {
			const prev = cloneDeep(query$.current.getValue());
			const next = removeNulls(set(prev, path, value));
			query$.current.next(next);
		},
		[query$]
	);

	const debouncedUpdateQuery = React.useMemo(() => debounce(updateQuery, 250), [updateQuery]);

	const setQuery: SetQuery = React.useCallback(
		(path, value, debounceFlag = false) => {
			if (debounceFlag) {
				debouncedUpdateQuery(path, value);
			} else {
				updateQuery(path, value);
			}
		},
		[updateQuery, debouncedUpdateQuery]
	);

	return { query$: query$.current, setQuery, nextPage };
};

export default useQuery;
