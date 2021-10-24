import * as React from 'react';
import { useObservable, useObservableSuspense } from 'observable-hooks';
import { switchMap, catchError, shareReplay, first } from 'rxjs/operators';
import { useNavigation } from '@react-navigation/native';
import useAppState from '@wcpos/common/src/hooks/use-app-state';

type StoreDatabase = import('@wcpos/common/src/database').StoreDatabase;

type SortDirection = import('@wcpos/common/src/components/table/types').SortDirection;
export interface QueryState {
	search: string;
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
export const useDataObservable = (
	collectionName: 'products' | 'orders' | 'customers',
	initialQuery: QueryState,
	options = {}
) => {
	const { storeDB } = useAppState();
	const collection = storeDB.collections[collectionName];
	const [query, setQuery] = React.useState<QueryState>(initialQuery);
	const navigation = useNavigation();

	if (!collection) {
		throw Error('Collection not found');
	}

	/**
	 *
	 */
	const data$ = useObservable(
		(inputs$) =>
			inputs$.pipe(
				// distinctUntilChanged((a, b) => a[0] === b[0]),
				// debounceTime(150),
				switchMap(([q]) => {
					// const regexp = new RegExp(escape(q.search), 'i');
					// @ts-ignore
					const RxQuery = collection.query(q);
					// 	.find({
					// 		selector: {
					// 			dateCreatedGmt: { $regex: regexp },
					// 		},
					// 	})
					// 	// @ts-ignore
					// 	.sort({ [q.sortBy]: q.sortDirection });
					return RxQuery.$;
				}),
				shareReplay(1),
				catchError((err) => {
					console.error(err);
					return err;
				})
			),
		[query]
	);

	/**
	 *
	 */
	// useSubscription(data$.pipe(first()), (result: any) => {
	// 	// if first and empty, do an id audit
	// 	if (result.length === 0) {
	// 		// @ts-ignore
	// 		collection.audit().catch((err: any) => {
	// 			if (err && err.response && err.response.status === 401) {
	// 				// @ts-ignore
	// 				navigation.navigate('Modal', { login: true });
	// 			}
	// 			console.warn(err);
	// 		});
	// 	}
	// });

	/**
	 *
	 */
	// React.useEffect(() => {
	// 	// @ts-ignore
	// 	collection.restApiQuery(query).then((replicationState: any) => {
	// 		replicationState.error$.subscribe((err: any) => {
	// 			if (err.code === 401) {
	// 				// @ts-ignore
	// 				navigation.navigate('Modal', { login: true });
	// 			}
	// 		});
	// 	});
	// }, [collection, query]);

	/**
	 *
	 */
	return { data$, query, setQuery };
};
