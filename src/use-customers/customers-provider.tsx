import * as React from 'react';
import { BehaviorSubject, combineLatest } from 'rxjs';
import { tap, switchMap, map, debounceTime } from 'rxjs/operators';
import { ObservableResource } from 'observable-hooks';
import useAppState from '@wcpos/hooks/src/use-app-state';
import _map from 'lodash/map';
import _set from 'lodash/set';
import useRestHttpClient from '../use-rest-http-client';

type CustomerDocument = import('@wcpos/database/src/collections/customers').CustomerDocument;
type SortDirection = import('@wcpos/components/src/table/table').SortDirection;

export interface QueryState {
	// search?: Record<string, unknown>;
	search?: string;
	sortBy: string;
	sortDirection: SortDirection;
	filters?: Record<string, unknown>;
}

export const CustomersContext = React.createContext<{
	query$: BehaviorSubject<QueryState>;
	setQuery: (path: string | string[], value: any) => void;
	resource: ObservableResource<CustomerDocument[]>;
}>(null);

interface CustomersProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
}

const CustomersProvider = ({ children, initialQuery }: CustomersProviderProps) => {
	const query$ = React.useMemo(() => new BehaviorSubject(initialQuery), [initialQuery]);
	const { storeDB } = useAppState();
	const collection = storeDB.collections.customers;
	const http = useRestHttpClient();

	/**
	 *
	 */
	const setQuery = React.useCallback(
		(path, value) => {
			const prev = query$.getValue();
			const next = _set(prev, path, value);
			query$.next(next);
		},
		[query$]
	);

	// combineLatest([storeDB?.collections.customers.$, query$]).subscribe(() => {
	// 	debugger;
	// });

	/**
	 *
	 */
	const customers$ = query$.pipe(
		// debounce hits to the local db
		debounceTime(100),
		// switchMap to the collection query
		switchMap((q) => {
			const selector = {};
			// forEach(q.search, function (value, key) {
			// 	if (value) {
			// 		set(selector, [key, '$regex'], new RegExp(escape(value), 'i'));
			// 	}
			// });

			const RxQuery = collection.find({ selector });

			return RxQuery.$.pipe(
				// sort the results
				map((result) => result)
				// @ts-ignore
				// map((result) => {
				// 	const array = Array.isArray(result) ? result : [];
				// 	const productSorter = (product: any) => {
				// 		if (q.sortBy === 'name') {
				// 			// @TODO - this doens't work
				// 			return product[q.sortBy].toLowerCase();
				// 		}
				// 		return product[q.sortBy];
				// 	};
				// 	return orderBy(array, [productSorter], [q.sortDirection]);
				// })
			);
		}),
		tap(async () => {
			// if there are unsynced
			const unsyncedDocs = collection.unsyncedIds$.getValue();
			const syncedDocs = collection.syncedIds$.getValue();

			if (unsyncedDocs) {
				const params = {
					// order: 'asc',
					// orderby: 'title',
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
				await Promise.all(_map(documents, (doc) => collection.upsert(doc)));
			}
		})
	);

	const resource = React.useMemo(() => new ObservableResource(customers$), [customers$]);

	/**
	 *
	 */
	const value = React.useMemo(
		() => ({
			query$,
			// query: query$.getValue(),
			setQuery,
			resource,
		}),
		[query$, resource, setQuery]
	);

	return <CustomersContext.Provider value={value}>{children}</CustomersContext.Provider>;
};

export default CustomersProvider;
