import * as React from 'react';

// import difference from 'lodash/difference';
import get from 'lodash/get';
import { useObservableState, useObservableEagerState } from 'observable-hooks';
import { RxDocument, RxCollection } from 'rxdb';
import { replicateRxCollection, RxReplicationState } from 'rxdb/plugins/replication';
import { interval, debounceTime } from 'rxjs';
import { map } from 'rxjs/operators';

import log from '@wcpos/utils/src/logger';

import { getAndPatchRecentlyModified } from './audit.helpers';
import {
	defaultPrepareQueryParams,
	getPriority,
	// retryWithExponentialBackoff,
} from './replication.helpers';
import useAudit from './use-audit';
import useLocalData from '../../../../contexts/local-data';
import useQueuedRestRequest from '../../hooks/use-queued-rest-request';

import type { QueryObservable, QueryState } from '../use-query';

export type ReplicationState = RxReplicationState<RxDocument, object>;

/**
 *
 */
// const replicationRefRegistry = new Map();

interface Props {
	collection: RxCollection;
	query$: QueryObservable;
	prepareQueryParams?: (
		params: ReturnType<typeof defaultPrepareQueryParams>,
		query: QueryState,
		status: any,
		batchSize: number
	) => Record<string, string>;
	pollingTime?: number;
	apiEndpoint?: string;
}

const maxRequests = 5;

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
	const query = useObservableEagerState(query$);
	const { site } = useLocalData();
	const apiURL = useObservableState(site.wc_api_url$, site.wc_api_url);
	const queuedHttp = useQueuedRestRequest();
	const endpoint = apiEndpoint || collection.name;
	const audit = useAudit({ collection, endpoint });
	const replicationRef = React.useRef();
	const [replicationState, setReplicationState] = React.useState();
	const requestCountRef = React.useRef(0);

	/**
	 *
	 */
	React.useMemo(() => {
		const newReplicationState = replicateRxCollection({
			collection,
			replicationIdentifier: `replication-to-${apiURL}/${endpoint}`,
			autoStart: false,
			// push: {
			// 	handler: async () => Promise.resolve([]),
			// },
			pull: {
				fetchRemoteIDs: async () => {},
				handler: async (rxdbCheckpoint, batchSize) => {
					if (requestCountRef.current >= maxRequests) {
						requestCountRef.current = 0;
						return {
							documents: [],
						};
					}
					requestCountRef.current += 1;

					try {
						const status = await audit.run();

						const defaultParams = defaultPrepareQueryParams(query, status, batchSize);
						const params = prepareQueryParams
							? prepareQueryParams(defaultParams, query, status, batchSize)
							: defaultParams;

						// hack to stop the API from returning all docs, how to search by uuid?
						if ('uuid' in params || 'earlyReturn' in params) {
							return {
								documents: [],
								// checkpoint: null,
							};
						}

						/**
						 * FIXME: Hack to fix the issue with rxdb silently dropping lastModified data
						 */
						if (params.modified_after) {
							await getAndPatchRecentlyModified(
								params.modified_after,
								collection,
								endpoint,
								queuedHttp
							);
						}

						const response = await queuedHttp.post(
							endpoint,
							{
								// signal: controller.signal,
								params,
								data: {
									include: status.include,
									exclude: status.exclude,
								},
								headers: {
									'X-HTTP-Method-Override': 'GET',
								},
							},
							getPriority(endpoint, params),
							endpoint
						);
						const data = get(response, 'data', []);

						return {
							documents: data.concat(status.remove),
							// checkpoint: null,
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

		replicationRef.current = newReplicationState;
		replicationRef.current.audit = audit;
	}, [apiURL, audit, collection, endpoint, pollingTime, prepareQueryParams, query, queuedHttp]);

	/**
	 *
	 */
	React.useEffect(() => {
		if (replicationRef.current) {
			setReplicationState((prev) => {
				if (prev) {
					prev.cancel();
				}
				replicationRef.current.start();
				return replicationRef.current;
			});
		}
	}, [query, collection]);

	/**
	 *
	 */
	// React.useEffect(() => {
	// 	if (replicationRef.current) {
	// 		setReplicationState((prev) => {
	// 			if (prev) {
	// 				prev.cancel();
	// 			}
	// 			replicationRef.current.start();
	// 			return replicationRef.current;
	// 		});
	// 	}
	// 	return () => {
	// 		if (replicationRef.current) {
	// 			replicationRef.current.cancel();
	// 		}
	// 	};
	// }, []);

	/**
	 *
	 */
	return replicationState;
};
