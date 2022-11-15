import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import _get from 'lodash/get';
import _isEmpty from 'lodash/isEmpty';
import _set from 'lodash/set';
import { ObservableResource } from 'observable-hooks';
import { of } from 'rxjs';
import { switchMap, map, debounceTime, tap } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import useStore from '../../contexts/store';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';
import { useReplication } from './use-replication';

type CustomerDocument = import('@wcpos/database/src/collections/customers').CustomerDocument;

export const CustomersContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<CustomerDocument[]>;
	sync: () => void;
}>(null);

interface CustomersProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
	ui?: import('../../contexts/ui').UIDocument;
}

const CustomersProvider = ({ children, initialQuery, ui }: CustomersProviderProps) => {
	log.debug('render customer provider');
	const { storeDB } = useStore();
	const collection = storeDB.collections.customers;
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplication({ collection });

	/**
	 * Only run the replication when the Provider is mounted
	 */
	React.useEffect(() => {
		replicationState.start();
		return () => {
			// this is async, should we wait?
			replicationState.cancel();
		};
	}, [replicationState]);

	/**
	 *
	 */
	const value = React.useMemo(() => {
		const resource$ = query$.pipe(
			// debounce hits to the local db
			debounceTime(100),
			// switchMap to the collection query
			switchMap((q) => {
				const selector = {};

				// const searchFields = ['username'];
				// if (q.search) {
				// 	selector.$or = searchFields.map((field) => ({
				// 		[field]: { $regex: new RegExp(escape(q.search), 'i') },
				// 	}));
				// }
				if (_get(q, 'search', '')) {
					_set(selector, ['username', '$regex'], new RegExp(escape(_get(q, 'search', '')), 'i'));
				}

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
			})
		);

		return {
			query$,
			setQuery,
			resource: new ObservableResource(resource$),
			replicationState,
		};
	}, [query$, setQuery, replicationState, collection]);

	return <CustomersContext.Provider value={value}>{children}</CustomersContext.Provider>;
};

export default CustomersProvider;
