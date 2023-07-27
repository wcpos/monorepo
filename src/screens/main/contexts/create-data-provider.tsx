import * as React from 'react';

import { ObservableResource } from 'observable-hooks';

import usePagination from './use-pagination';
import useReplicationState from './use-replication-state';
import useLocalData from '../../../contexts/local-data';
import useCollection, { CollectionKey } from '../hooks/use-collection';

import type { Query, QueryState } from './query';
import type { RxCollection } from 'rxdb';

interface DataProviderProps {
	children: React.ReactNode;
	query: Query<RxCollection>;
	apiEndpoint?: string;
	remoteIDs?: number[];
	clearCollectionNames?: CollectionKey[];
}

interface DataContextValue<TDocument> {
	query: Query<RxCollection>;
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

export type HookTypes = {
	preQuerySelector: (selector: any, queryState: QueryState) => any;
	postQueryResult: (result: any, queryState: QueryState) => any;
	filterApiQueryParams: (params: any, checkpoint: any, batchSize: number) => any;
	// anotherHookType: (arg1: Type1, arg2: Type2) => ReturnType;
	// Add other hook types as needed...
};

export type Hooks = {
	[K in keyof HookTypes]?: HookTypes[K];
};

/**
 *
 */
const createDataProvider = <TDocument, TQueryParams>({
	collectionName,
	prepareQueryParams,
	hooks = {},
}: {
	collectionName: CollectionKey;
	clearCollectionNames?: CollectionKey[];
	prepareQueryParams?: (
		params: TQueryParams,
		query: QueryState,
		checkpoint: any,
		batchSize: number
	) => TQueryParams;
	hooks?: Hooks;
}): DataProviderReturnType<TDocument, TQueryParams> => {
	const DataContext = React.createContext<DataContextValue<TDocument>>(null);

	/**
	 *
	 */
	const DataProvider = ({
		children,
		query,
		apiEndpoint,
		remoteIDs,
		clearCollectionNames,
	}: DataProviderProps) => {
		const { storeDB } = useLocalData();
		const { collection } = useCollection(collectionName);

		/**
		 * Complete query instance setup
		 * - add the collection
		 * - add hooks
		 */
		query.collection(collection);
		Object.entries(hooks).forEach(([hookName, hookFunction]) => {
			query.addHook(hookName, hookFunction);
		});

		/**
		 *
		 */
		const replicationState = useReplicationState({
			collection,
			query,
			prepareQueryParams,
			apiEndpoint,
			remoteIDs,
			hooks,
		});

		const { paginatedData$, loadNextPage } = usePagination({ data$: query.$ });

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
		const resource = React.useMemo(() => new ObservableResource(query.$), [query.$]);
		const paginatedResource = React.useMemo(
			() => new ObservableResource(paginatedData$),
			[paginatedData$]
		);

		/**
		 *
		 */
		const clear = React.useCallback(async () => {
			replicationState.cancel();
			await storeDB.reset(clearCollectionNames || [collectionName]);
		}, [clearCollectionNames, replicationState, storeDB]);

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
					query,
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
