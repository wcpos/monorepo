import * as React from 'react';

import difference from 'lodash/difference';
import get from 'lodash/get';
import { useObservableState } from 'observable-hooks';
import { defaultHashSha256, RxDocument, RxCollection } from 'rxdb';
import { replicateRxCollection, RxReplicationState } from 'rxdb/plugins/replication';
import { interval } from 'rxjs';
import { map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import {
	defaultPrepareQueryParams,
	parseHeaders,
	Checkpoint,
	getLocalIDs,
} from './replication.helpers';
import useAudit from './use-audit';
import useLocalData from '../../../../contexts/local-data';
import useRestHttpClient from '../../hooks/use-rest-http-client';

import type { QueryObservable, QueryState } from '../use-query';

export type ReplicationState = RxReplicationState<RxDocument, object>;

/**
 *
 */
const replicationStateRegistry = new Map();

interface Props {
	collection: RxCollection;
	query$: QueryObservable;
	prepareQueryParams?: (
		params: ReturnType<typeof defaultPrepareQueryParams>,
		query: QueryState,
		checkpoint: Checkpoint,
		batchSize: number
	) => Record<string, string>;
	pollingTime?: number;
	apiEndpoint?: string;
}

/**
 *
 */
export const useReplicationState = ({
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
	const audit = useAudit({ collection, endpoint });

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
				push: {
					handler: async () => Promise.resolve([]),
				},
				pull: {
					handler: async (rxdbCheckpoint, batchSize) => {
						try {
							const checkpoint = await collection
								.getLocal(hash)
								.then((doc) => doc?.toJSON().data || {});

							if (checkpoint.count && checkpoint.count === 5) {
								await collection.upsertLocal(hash, {
									...checkpoint,
									count: 0,
								});
								return {
									documents: [],
								};
							}

							const remote = await collection
								.getLocal('remote-' + endpoint)
								.then((doc) => doc?.toJSON().data || {});

							let remoteIDs = remote.remoteIDs;
							if (!remoteIDs) {
								remoteIDs = await audit.run();
							}

							// get the local IDs here for auditting
							const localIDs = await getLocalIDs(collection, endpoint);

							// compare the two arrays
							const add = difference(remoteIDs, localIDs);
							const remove = difference(localIDs, remoteIDs);
							const completeIntitalSync = add.length === 0;

							if (remove.length > 0) {
								const docs = await collection.find({ selector: { id: { $in: remove } } }).exec();
								await collection.bulkRemove(docs.map((doc) => doc.uuid));
							}

							const defaultParams = defaultPrepareQueryParams(
								query,
								checkpoint,
								batchSize,
								completeIntitalSync
							);
							const params = prepareQueryParams
								? prepareQueryParams(defaultParams, query, checkpoint, batchSize)
								: defaultParams;

							// hack to stop the API from returning all docs, how to search by uuid?
							if ('uuid' in params) {
								return {
									documents: [],
								};
							}

							// special case for includes
							if ('include' in params) {
								// include should check if they are all in the local db
							}

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
								count: (checkpoint.count || 0) + 1,
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

	return replicationState ? Object.assign(replicationState, { audit }) : null;
};
