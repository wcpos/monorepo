import * as React from 'react';

import { orderBy } from '@shelf/fast-natural-order-by';
import set from 'lodash/set';
import { ObservableResource } from 'observable-hooks';
import { switchMap, map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import useCustomerReplication from './use-customer-replication';
import useLocalData from '../../../../contexts/local-data';
import useQuery, { QueryObservable, QueryState, SetQuery } from '../use-query';

type CustomerDocument = import('@wcpos/database/src/collections/customers').CustomerDocument;

export const CustomersContext = React.createContext<{
	query$: QueryObservable;
	setQuery: SetQuery;
	resource: ObservableResource<CustomerDocument[]>;
	sync: () => void;
	clear: () => Promise<any>;
}>(null);

interface CustomersProviderProps {
	children: React.ReactNode;
	initialQuery: QueryState;
	uiSettings: import('../ui-settings').UISettingsDocument;
}

const CustomersProvider = ({ children, initialQuery, uiSettings }: CustomersProviderProps) => {
	log.debug('render customer provider');
	const { storeDB } = useLocalData();
	const collection = storeDB.collections.customers;
	const { query$, setQuery } = useQuery(initialQuery);
	const { replicationState, clear, sync } = useCustomerReplication(query$);

	/**
	 * Only run the replication when the Provider is mounted
	 */
	React.useEffect(() => {
		replicationState.start();
		return () => {
			// this is async, should we wait?
			replicationState.cancel();
		};
	}, []);

	/**
	 *
	 */
	const value = React.useMemo(() => {
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

		return {
			resource: new ObservableResource(resource$),
		};
	}, [query$, collection]);

	return (
		<CustomersContext.Provider
			value={{ ...value, query$, setQuery, clear, sync, replicationState }}
		>
			{children}
		</CustomersContext.Provider>
	);
};

export default CustomersProvider;
