import * as React from 'react';

import { filter } from 'lodash';
import { ObservableResource } from 'observable-hooks';

import useLocalDataQuery from './use-local-data-query';
import usePagination from './use-pagination';
import useQuery, { QueryObservable, QueryState, SetQuery } from './use-query';
import useReplicationState from './use-replication-state';
import useLocalData from '../../../contexts/local-data';
import useCollection, { CollectionKey } from '../hooks/use-collection';

import type { Observable } from 'rxjs';

interface DataProviderProps {
	children: React.ReactNode;
	initialQuery?: QueryState;
	apiEndpoint?: string;
	remoteIDs?: number[];
}

interface DataContextValue<TDocument> {
	query$: QueryObservable;
	setQuery: SetQuery;
	setDebouncedQuery: SetQuery;
	resource: ObservableResource<TDocument[]>;
	paginatedResource: ObservableResource<{
		data: TDocument[];
		count: number;
		hasMore: boolean;
	}>;
	sync: () => void;
	clear: () => Promise<any>;
	replicationState: import('./use-replication-state').ReplicationState;
	loadNextPage: () => void;
}

type DataProviderReturnType<TDocument, TQueryParams> = [
	(props: DataProviderProps) => JSX.Element,
	() => DataContextValue<TDocument>,
];

/**
 *
 */
const createDataProvider = <TDocument, TQueryParams>({
	collectionName,
	initialQuery,
	prepareQueryParams,
	filterQuery,
	filterQueryData,
}: {
	collectionName: CollectionKey;
	initialQuery: QueryState;
	prepareQueryParams?: (
		params: TQueryParams,
		query: QueryState,
		checkpoint: any,
		batchSize: number
	) => TQueryParams;
	filterQuery?: (query$: QueryObservable) => QueryObservable;
	filterQueryData?: (
		data$: Observable<TDocument[]>,
		query$: QueryObservable
	) => Observable<TDocument[]>;
}): DataProviderReturnType<TDocument, TQueryParams> => {
	const DataContext = React.createContext<DataContextValue<TDocument>>(null);

	/**
	 *
	 */
	const DataProvider = ({ children, initialQuery, apiEndpoint, remoteIDs }: DataProviderProps) => {
		const { storeDB } = useLocalData();
		const { collection } = useCollection(collectionName);
		const { query$, setQuery, setDebouncedQuery } = useQuery(initialQuery);
		const replicationState = useReplicationState({
			collection,
			query$,
			prepareQueryParams,
			apiEndpoint,
			remoteIDs,
		});
		const filteredQuery$ = filterQuery ? filterQuery(query$) : query$;
		const { queryData$ } = useLocalDataQuery({ collection, query$: filteredQuery$ });
		const filteredQueryData$ = filterQueryData ? filterQueryData(queryData$, query$) : queryData$;
		const { paginatedData$, loadNextPage } = usePagination({ data$: filteredQueryData$ });

		/**
		 *
		 */
		React.useEffect(() => {
			replicationState.start();
			return () => {
				replicationState.cancel();
			};
		}, [replicationState]);

		/**
		 *
		 */
		const resource = React.useMemo(
			() => new ObservableResource(filteredQueryData$),
			[filteredQueryData$]
		);
		const paginatedResource = React.useMemo(
			() => new ObservableResource(paginatedData$),
			[paginatedData$]
		);

		/**
		 *
		 */
		const clear = React.useCallback(async () => {
			replicationState.cancel();
			await storeDB.reset([collectionName]);
		}, [replicationState, storeDB]);

		/**
		 *
		 */
		const sync = React.useCallback(() => {
			replicationState.reSync();
		}, [replicationState]);

		/**
		 *
		 */
		return (
			<DataContext.Provider
				value={{
					resource,
					paginatedResource,
					query$,
					setQuery,
					setDebouncedQuery,
					clear,
					sync,
					replicationState,
					loadNextPage,
				}}
			>
				{children}
			</DataContext.Provider>
		);
	};

	const useData = () => {
		const context = React.useContext(DataContext);
		if (context === undefined) {
			throw new Error(`useData must be used within a DataProvider`);
		}
		return context;
	};

	return [DataProvider, useData];
};

export default createDataProvider;
