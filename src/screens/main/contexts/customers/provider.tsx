import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import { ObservableResource } from 'observable-hooks';
import { switchMap, map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../../contexts/local-data';
import clearCollection from '../clear-collection';
import syncCollection from '../sync-collection';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';
import useReplicationState from '../use-replication-state';

type CustomerDocument = import('@wcpos/database/src/collections/customers').CustomerDocument;

export const CustomersContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<CustomerDocument[]>;
	sync: () => void;
	clear: () => Promise<any>;
	replicationState: import('../use-replication-state').ReplicationState;
}>(null);

interface CustomersProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
	uiSettings: import('../ui-settings').UISettingsDocument;
}

interface APIQueryParams {
	context?: 'view' | 'edit';
	page?: number;
	per_page?: number;
	search?: string;
	exclude?: number[];
	include?: number[];
	offset?: number;
	order?: 'asc' | 'desc';
	orderby?: 'id' | 'include' | 'name' | 'registered_date';
	email?: string;
	role?:
		| 'all'
		| 'administrator'
		| 'editor'
		| 'author'
		| 'contributor'
		| 'subscriber'
		| 'customer'
		| 'shop_manager';
}

/**
 *
 */
const prepareQueryParams = (
	params: APIQueryParams,
	query: QueryState,
	checkpoint,
	batchSize
): APIQueryParams => {
	let orderby;

	/**
	 * @TODO - I need to account for all the different query options and map them properly to the API
	 */
	if (query.sortBy === 'first_name' || query.sortBy === 'last_name') {
		orderby = 'name';
	} else {
		orderby = 'id';
	}

	return {
		...params,
		role: 'all',
		orderby,
	};
};

/**
 *
 */
const CustomersProvider = ({ children, initialQuery, uiSettings }: CustomersProviderProps) => {
	log.debug('render customer provider');
	const { storeDB, store } = useLocalData();
	const collection = storeDB.collections.customers;
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplicationState({ collection, query$, prepareQueryParams });

	/**
	 *
	 */
	const resource = React.useMemo(() => {
		const resource$ = query$.pipe(
			switchMap((query) => {
				const { search, selector: querySelector, sortBy, sortDirection, limit, skip } = query;
				let selector;

				const searchSelector = search
					? {
							$or: [
								{ first_name: { $regex: new RegExp(escape(search), 'i') } },
								{ last_name: { $regex: new RegExp(escape(search), 'i') } },
								{ email: { $regex: new RegExp(escape(search), 'i') } },
								{ username: { $regex: new RegExp(escape(search), 'i') } },
								{ 'billing.first_name': { $regex: new RegExp(escape(search), 'i') } },
								{ 'billing.last_name': { $regex: new RegExp(escape(search), 'i') } },
								{ 'billing.email': { $regex: new RegExp(escape(search), 'i') } },
								{ 'billing.company': { $regex: new RegExp(escape(search), 'i') } },
								{ 'billing.phone': { $regex: new RegExp(escape(search), 'i') } },
							],
					  }
					: null;

				if (querySelector && searchSelector) {
					selector = {
						$and: [querySelector, searchSelector],
					};
				} else {
					selector = querySelector || searchSelector || {};
				}

				const RxQuery = collection.find({ selector });

				return RxQuery.$.pipe(
					map((result) => {
						return orderBy(result, [sortBy], [sortDirection]);
					})
				);
			})
		);

		return new ObservableResource(resource$);
	}, [query$, collection]);

	/**
	 *
	 */
	return (
		<CustomersContext.Provider
			value={{
				resource,
				query$,
				setQuery,
				clear: () => clearCollection(store.localID, collection),
				sync: () => syncCollection(replicationState),
				replicationState,
			}}
		>
			{children}
		</CustomersContext.Provider>
	);
};

export default CustomersProvider;
