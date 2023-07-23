import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservable } from 'observable-hooks';
import { interval } from 'rxjs';
import { map } from 'rxjs/operators';

import { replicateRxCollection } from '@wcpos/database/src/plugins/wc-rest-api-replication';
import log from '@wcpos/utils/src/logger';

import {
	defaultPrepareQueryParams,
	// retryWithExponentialBackoff,
} from './replication.helpers';
import useLocalData from '../../../../contexts/local-data';
import useRestHttpClient from '../../hooks/use-rest-http-client';

import type { QueryObservable, QueryState } from '../use-query';
import type { RxCollection } from 'rxdb';

interface Props {
	collection: RxCollection;
	apiEndpoint?: string;
	query$: QueryObservable;
	prepareQueryParams?: (
		params: ReturnType<typeof defaultPrepareQueryParams>,
		query: QueryState,
		checkpoint: any,
		batchSize: number
	) => Record<string, string>;
	pollingTime?: number;
	remoteIDs?: number[];
}

/**
 *
 */
export const useReplicationState = ({
	collection,
	apiEndpoint,
	query$,
	prepareQueryParams,
	pollingTime = 600000,
	remoteIDs,
}: Props) => {
	const { site } = useLocalData();
	const apiURL = useObservableState(site.wc_api_url$, site.wc_api_url);
	const endpoint = apiEndpoint || collection.name;
	const http = useRestHttpClient();

	/**
	 * Create a long polling stream
	 */
	const poll$ = useObservable(() => interval(pollingTime).pipe(map(() => 'RESYNC')));

	/**
	 *
	 */
	const replicationState = React.useMemo(() => {
		return replicateRxCollection({
			collection,
			replicationIdentifier: `replication-to-${apiURL}/${endpoint}`,
			pull: {
				fetchRemoteIDs: async () => {
					// if remoteIDs are passed in, use those
					if (remoteIDs) {
						return remoteIDs;
					}

					// otherwise, fetch from API
					try {
						const response = await http.get(endpoint, {
							params: { fields: ['id'], posts_per_page: -1 },
						});
						const data = get(response, 'data', []);
						return data.map((doc) => doc.id);
					} catch (err) {
						log.error(err);
					}
				},
				fetchLocalDocs: async () => {
					/**
					 * TODO: if variation, search by id includes parent.variations
					 */
					try {
						const localDocs = await collection.find().exec();
						return localDocs;
					} catch (err) {
						log.error(err);
					}
				},
				handler: async (checkpoint, batchSize) => {
					try {
						const query = query$.getValue();
						const defaultParams = defaultPrepareQueryParams(query, batchSize);
						const params = prepareQueryParams(defaultParams, query, checkpoint, batchSize);
						let response;

						if (checkpoint.completeIntitalSync) {
							response = await http.get(endpoint, {
								// signal: controller.signal,
								params: {
									...params,
									modified_after: checkpoint.lastModified,
								},
							});
						} else {
							response = await http.post(
								endpoint,
								{
									include: checkpoint.include,
									exclude: checkpoint.exclude,
								},
								{
									// signal: controller.signal,
									params,
									headers: {
										'X-HTTP-Method-Override': 'GET',
									},
								}
							);
						}

						return {
							documents: get(response, 'data', []),
							checkpoint,
						};
					} catch (err) {
						log.error(err);
					}
				},
				batchSize: 10,
				modifier: async (doc) => {
					try {
						const parsedData = collection.parseRestResponse(doc);
						await collection.upsertRefs(parsedData); // upsertRefs mutates the parsedData
						return parsedData;
					} catch (err) {
						log.error(err);
					}
				},
				stream$: poll$,
			},
		});
	}, [apiURL, collection, endpoint, http, poll$, prepareQueryParams, query$]);

	return replicationState;
};
