import * as React from 'react';
import { useObservableState, useObservable } from 'observable-hooks';
import { switchMap, map, throttleTime } from 'rxjs/operators';
import set from 'lodash/set';
import useAppState from '@wcpos/common/src/hooks/use-app-state';

type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;

export interface QueryState {
	search: any;
	sortBy: string;
	sortDirection: SortDirection;
	filters?: Record<string, unknown>;
}

const escape = (text: string) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

/**
 *
 *
 * @param collectionName
 * @param initialQuery
 * @param options
 * @returns
 */
export const useCollectionQuery = (
	collectionName: 'products' | 'orders' | 'customers',
	initialQuery: QueryState,
	options = {}
) => {
	const { storeDB } = useAppState();
	const collection = storeDB.collections[collectionName];
	const query = React.useRef(initialQuery);

	const [data, runQuery] = useObservableState<any[], QueryState>(
		(input$) =>
			input$.pipe(
				// throttleTime(100),
				switchMap((q) => {
					const selector = {};
					if (q.search) {
						const regexp = new RegExp(escape(q.search), 'i');
						set(selector, ['name', '$regex'], regexp);
					}
					const RxQuery = collection.find({ selector });
					return RxQuery.$;
				}),
				map((result) => (Array.isArray(result) ? result : []))
			),
		[]
	);

	const setQuery = React.useCallback(
		(path: string | string[], value: any) => {
			set(query.current, path, value);
			runQuery(query.current);
		},
		[runQuery]
	);

	React.useEffect(
		() => {
			runQuery(query.current);
		},
		// trigger only on first render
		[]
	);

	return { data, query: query.current, setQuery, count: data.length };
};
