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
		console.log('TRIGGERED');

		// replicate unsynced items
		const replicationState = replicateRxCollection({
			collection,
			replicationIdentifier: 'product-replication',
			live: false,
			// liveInterval: 10000,
			retryTime: 10000000,
			pull: {
				async handler(latestPullDocument) {
					const syncedDocs = collection.syncedIds$.getValue();
					const unsyncedDocs = collection.unsyncedIds$.getValue();

					if (unsyncedDocs.length === 0) {
						return {
							documents: [],
							hasMoreDocuments: false,
						};
					}

					console.log('unsyncedDocs', unsyncedDocs);

					// if there are unsynced docs, then we need to sync them
					const params = {
						order: 'asc',
						orderby: 'title',
					};

					// choose the smallest array, max of 1000
					if (syncedDocs.length > unsyncedDocs.length) {
						params.include = unsyncedDocs.slice(0, 1000).join(',');
					} else {
						params.exclude = syncedDocs.slice(0, 1000).join(',');
					}

					const result = await http
						.get(collection.name, {
							params,
						})
						.catch(({ response }) => {
							console.log(response);
						});

					// const documents = result?.data;
					// @TODO - why aren't documents being parsed on insert
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

		return () => {
			// cancel any replications
			if (replicationState) {
				replicationState.cancel();
			}
		};
		// NOTE: if I include http here it will get triggered constantly
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
