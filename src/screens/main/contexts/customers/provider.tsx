import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import isEqual from 'lodash/isEqual';
import { ObservableResource } from 'observable-hooks';
import { switchMap, map, distinctUntilChanged } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../../contexts/local-data';
import useCollection from '../../hooks/use-collection';
import { clearCollection } from '../clear-collection';
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
	let orderby = params.orderby;

	if (query.sortBy === 'date_created') {
		orderby = 'registered_date';
	}

	// HACK: get the deafult_customer, probably a better way to do this
	if (params.id) {
		params.include = params.id;
		params.id = undefined;
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
	const { store } = useLocalData();
	const collection = useCollection('customers');
	const { query$, setQuery } = useQuery(initialQuery);
	const replicationState = useReplicationState({ collection, query$, prepareQueryParams });

	/**
	 *
	 */
	const resource = React.useMemo(() => {
		const resource$ = query$.pipe(
			switchMap((query) => {
				const { search, selector: querySelector, sortBy, sortDirection, limit, skip } = query;
				const selector = { $and: [] };

				if (search) {
					selector.$and.push({
						$or: [
							{ uuid: search },
							{ id: { $regex: new RegExp(escape(search), 'i') } },
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
					});
				}

				if (querySelector) {
					selector.$and.push(querySelector);
				}

				const RxQuery = collection.find({ selector, limit, skip });

				return RxQuery.$.pipe(
					map((result) => {
						return orderBy(result, [sortBy], [sortDirection]);
					}),
					distinctUntilChanged((prev, next) => {
						// only emit when the uuids change
						return isEqual(
							prev.map((doc) => doc.uuid),
							next.map((doc) => doc.uuid)
						);
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
				collection,
			}}
		>
			{children}
		</CustomersContext.Provider>
	);
};

export default CustomersProvider;
