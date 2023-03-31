import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { defaultHashSha256, RxDocument, RxCollection } from 'rxdb';
import { replicateRxCollection, RxReplicationState } from 'rxdb/plugins/replication';
import { interval } from 'rxjs';
import { map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../contexts/local-data';
import { parseLinkHeader } from '../../../lib/url';
import useRestHttpClient from '../hooks/use-rest-http-client';

import type { QueryState, QueryObservable } from './use-query';

export type ReplicationState = RxReplicationState<RxDocument, object>;

const parseHeaders = (response) => {
	const link = get(response, ['headers', 'link']);
	const parsedHeaders = parseLinkHeader(link);
	const remoteTotal = get(response, ['headers', 'x-wp-total']);
	const totalPages = get(response, ['headers', 'x-wp-totalpages']);
	const nextPage = get(parsedHeaders, ['next', 'page']);

	return {
		remoteTotal,
		totalPages,
		nextPage,
	};
};

/**
 *
 */
const replicationStateRegistry = new Map();

/**
 *
 */
interface Checkpoint extends ReturnType<typeof parseHeaders> {
	lastModified: string;
	completeIntitalSync: boolean;
}

/**
 *
 */
const defaultPrepareQueryParams = (
	query: QueryState,
	checkpoint: Checkpoint,
	batchSize: number
) => {
	return {
		order: query.sortDirection,
		orderby: query.sortBy,
		page: checkpoint.nextPage || 1,
		per_page: batchSize,
		/**
		 * FIXME:
		 */
		after: checkpoint.completeIntitalSync ? checkpoint.lastModified : null,
	};
};

interface Props {
	collection: RxCollection;
	query$: QueryObservable;
	prepareQueryParams?: (
		params: ReturnType<typeof defaultPrepareQueryParams>
	) => Record<string, string>;
	pollingTime?: number;
	apiEndpoint?: string;
}

/**
 *
 */
const useReplicationState = ({
	collection,
	query$,
	prepareQueryParams,
	pollingTime = 600000,
	apiEndpoint,
}: Props) => {
	const [replicationState, setReplicationState] = React.useState<ReplicationState | null>(null);
	const query = useObservableState(query$, query$.getValue());
	const { site, store } = useLocalData();
	const apiURL = useObservableState(site.wc_api_url$, site.wc_api_url);
	const http = useRestHttpClient();
	const hashRef = React.useRef(null);
	const endpoint = apiEndpoint || collection.name;

	/**
	 *
	 */
	React.useEffect(() => {
		// storeID is required because cashiers can switch stores
		// endpoint is required for variations
		const hash = defaultHashSha256(JSON.stringify({ storeID: store.localID, endpoint, query }));
		hashRef.current = hash;

		if (!replicationStateRegistry.has(hash)) {
			// Cancel the previous replicationState if it exists
			if (replicationState) {
				replicationState.cancel();
				// replicationState.abortController.abort();
			}

			// create a new AbortController for each request
			// const controller = new AbortController();

			// Create a new replicationState instance and start it
			const newReplicationState = replicateRxCollection({
				collection,
				replicationIdentifier: `replication-to-${apiURL}/${endpoint}`,
				pull: {
					handler: async (rxdbCheckpoint, batchSize) => {
						try {
							const checkpoint = await collection
								.getLocal(hash)
								.then((doc) => doc?.toJSON().data || {});

							const defaultParams = defaultPrepareQueryParams(query, checkpoint, batchSize);
							const params = prepareQueryParams
								? prepareQueryParams(defaultParams, query, checkpoint, batchSize)
								: defaultParams;

							const response = await http.get(endpoint, {
								// signal: controller.signal,
								params,
							});
							const data = get(response, 'data', []);
							const headers = parseHeaders(response);

							// get most recent record
							const mostRecent = data.reduce(
								(prev, current) => {
									const prevDate = new Date(prev.date_modified_gmt);
									const currentDate = new Date(current.date_modified_gmt);
									return prevDate > currentDate ? prev : current;
								},
								{ date_modified_gmt: checkpoint.lastModified }
							);

							/**
							 * Set next checkpoint, using my own custom checkpoint
							 */
							await collection.upsertLocal(hash, {
								...headers,
								lastModified: mostRecent.date_modified_gmt,
								completeIntitalSync: headers.nextPage === undefined,
							});

							return {
								documents: data,
							};
						} catch (error) {
							log.error(error);
							throw error;
						}
					},
					batchSize: 10,
					modifier: async (doc) => {
						const parsedData = collection.parseRestResponse(doc);
						await collection.upsertRefs(parsedData); // upsertRefs mutates the parsedData
						return parsedData;
					},
					stream$: interval(pollingTime).pipe(map(() => 'RESYNC')),
				},
			});

			// newReplicationState.abortController = controller;
			replicationStateRegistry.set(hash, newReplicationState);
		}

		setReplicationState(replicationStateRegistry.get(hash));

		// Clean up on component unmount or when state changes
		return () => {
			const currentReplicationState = replicationStateRegistry.get(hashRef.current);

			if (currentReplicationState) {
				currentReplicationState.cancel();
				// currentReplicationState.abortController.abort();
				replicationStateRegistry.delete(hashRef.current);
			}
		};
	}, [
		// no replicationState
		collection,
		query,
		apiURL,
		http,
		pollingTime,
	]);

	return replicationState;
};

export default useReplicationState;
