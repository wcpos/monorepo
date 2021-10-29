import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import { switchMap, map, debounceTime } from 'rxjs/operators';
import set from 'lodash/set';
import forEach from 'lodash/forEach';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useQuery from '@wcpos/common/src/hooks/use-query';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';

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
 * @param options
 * @returns
 */
export const useCollectionQuery = (
	collectionName: 'products' | 'orders' | 'customers',
	options = {}
) => {
	const { storeDB } = useAppState();
	const collection = storeDB.collections[collectionName];
	const { query } = useQuery();

	const [data, updateQuery] = useObservableState<any[], QueryState>(
		(input$) =>
			input$.pipe(
				debounceTime(100),
				switchMap((q) => {
					const selector = {};
					forEach(q.search, function (value, key) {
						if (value) {
							set(selector, [key, '$regex'], new RegExp(escape(value), 'i'));
						}
					});
					const RxQuery = collection.find({ selector });
					return RxQuery.$;
				}),
				map((result) => (Array.isArray(result) ? result : []))
			),
		[]
	);

	/**
	 * TODO: React 18 use Transition
	 */
	React.useEffect(() => {
		// @ts-ignore
		updateQuery(query);
	}, [query, updateQuery]);

	useWhyDidYouUpdate('Collection Query', {
		storeDB,
		collection,
		query,
		data,
		updateQuery,
	});

	return { data };
};
