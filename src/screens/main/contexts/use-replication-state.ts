import * as React from 'react';

import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { defaultHashSha256, RxDocument } from 'rxdb';
import { replicateRxCollection, RxReplicationState } from 'rxdb/plugins/replication';

import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../contexts/local-data';
import { parseLinkHeader } from '../../../lib/url';
import useRestHttpClient from '../hooks/use-rest-http-client';

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
const defaultPrepareQueryParams = (query, checkpoint, batchSize) => {
	return {
		order: query.sortDirection,
		orderby: query.sortBy,
		page: checkpoint.nextPage || 1,
		per_page: batchSize,
		after: checkpoint.lastModified,
	};
};

/**
 *
 */
const useReplicationState = ({ collection, query$, prepareQueryParams }) => {
	const [replicationState, setReplicationState] = React.useState<ReplicationState | null>(null);
	const query = useObservableState(query$, query$.getValue());
	const { site, store } = useLocalData();
	const apiURL = useObservableState(site.wc_api_url$, site.wc_api_url);
	const http = useRestHttpClient();
	const hashRef = React.useRef(null);

	/**
	 *
	 */
	React.useEffect(() => {
		// storeID is required because cashiers can switch stores
		const hash = defaultHashSha256(JSON.stringify({ storeID: store.localID, query }));
		hashRef.current = hash;

		if (!replicationStateRegistry.has(hash)) {
			// Cancel the previous replicationState if it exists
			if (replicationState) {
				replicationState.cancel();
				replicationState.abortController.abort();
			}

			// create a new AbortController for each request
			const controller = new AbortController();

			// Create a new replicationState instance and start it
			const newReplicationState = replicateRxCollection({
				collection,
				replicationIdentifier: `wc-rest-replication-to-${apiURL}/${collection.name}`,
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

							const response = await http.get(collection.name, {
								signal: controller.signal,
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
				},
			});

			newReplicationState.abortController = controller;
			replicationStateRegistry.set(hash, newReplicationState);
		}

		setReplicationState(replicationStateRegistry.get(hash));

		// Clean up on component unmount or when state changes
		return () => {
			const currentReplicationState = replicationStateRegistry.get(hashRef.current);

			if (currentReplicationState) {
				currentReplicationState.cancel();
				currentReplicationState.abortController.abort();
				replicationStateRegistry.delete(hashRef.current);
			}
		};
	}, [
		// no replicationState
		collection,
		query,
		apiURL,
		http,
	]);

	return replicationState;
};

export default useReplicationState;
