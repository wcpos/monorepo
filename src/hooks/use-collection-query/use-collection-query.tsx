import * as React from 'react';
import { useObservableState } from 'observable-hooks';
import { switchMap, map, debounceTime } from 'rxjs/operators';
import set from 'lodash/set';
import get from 'lodash/get';
import forEach from 'lodash/forEach';
import orderBy from 'lodash/orderBy';
import useAppState from '@wcpos/common/src/hooks/use-app-state';
import useQuery from '@wcpos/common/src/hooks/use-query';
import useWhyDidYouUpdate from '@wcpos/common/src/hooks/use-why-did-you-update';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import _map from 'lodash/map';
import useRestHttpClient from '../use-rest-http-client';

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
	const http = useRestHttpClient();

	const [data, updateQuery] = useObservableState<any[], QueryState>((query$) => {
		return query$.pipe(
			// debounce hits to the local db
			debounceTime(100),
			// switchMap to the collection query
			switchMap((q) => {
				const selector = {};
				forEach(q.search, function (value, key) {
					if (value) {
						set(selector, [key, '$regex'], new RegExp(escape(value), 'i'));
					}
				});

				if (get(q, 'filters.category.id')) {
					set(selector, ['categories', '$elemMatch', 'id'], get(q, 'filters.category.id'));
				}
				if (get(q, 'filters.tag.id')) {
					set(selector, ['tags', '$elemMatch', 'id'], get(q, 'filters.tag.id'));
				}

				const RxQuery = collection.find({ selector });

				return RxQuery.$.pipe(
					// sort the results
					// @ts-ignore
					map((result) => {
						const array = Array.isArray(result) ? result : [];
						const productSorter = (product: any) => {
							if (q.sortBy === 'name') {
								// @TODO - this doens't work
								return product[q.sortBy].toLowerCase();
							}
							return product[q.sortBy];
						};
						return orderBy(array, [productSorter], [q.sortDirection]);
					})
				);
			})
		);
	}, []);

	/**
	 * TODO: React 18 use Transition
	 */
	React.useEffect(() => {
		updateQuery(query);
		let replicationState;

		// first check if there is any unsynced items
		collection.unsyncedDocuments$.subscribe(async (unsyncedDocuments) => {
			if (unsyncedDocuments.length > 0) {
				const include = unsyncedDocuments.map((doc) => doc.id).slice(0, 1000);

				replicationState = await replicateRxCollection({
					collection,
					replicationIdentifier: 'product-replication',
					pull: {
						async handler(latestPullDocument) {
							const result = await http
								.get('products', {
									params: { order: 'asc', orderby: 'title', include: include.join(',') },
								})
								.catch(({ response }) => {
									console.log(response);
								});
							const documents = _map(result?.data, (item) => collection.parseRestResponse(item));

							return {
								documents,
								hasMoreDocuments: false,
							};
						},
					},
				});

				replicationState.error$.subscribe((error) => {
					console.log('something was wrong');
					console.dir(error);
				});
			}
		});

		return () => {
			// cancel any replications
			if (replicationState) {
				replicationState.cancel();
			}
		};
	}, [query, updateQuery]);

	// useWhyDidYouUpdate('Collection Query', {
	// 	storeDB,
	// 	collection,
	// 	query,
	// 	data,
	// 	updateQuery,
	// });

	return { data, count: data.length };
};
