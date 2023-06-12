import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useSubscription } from 'observable-hooks';
import { interval, merge } from 'rxjs';
import { map, debounceTime, filter, tap, skip } from 'rxjs/operators';

import { replicateRxCollection } from '@wcpos/database/src/plugins/wc-rest-api-replication';
import log from '@wcpos/utils/src/logger';

import {
	defaultPrepareQueryParams,
	getPriority,
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
	tag?: string;
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
}: Props) => {
	const { site } = useLocalData();
	const apiURL = useObservableState(site.wc_api_url$, site.wc_api_url);
	const endpoint = apiEndpoint || collection.name;
	const http = useRestHttpClient();

	/**
	 * test
	 */
	const getLatestQuery = React.useCallback(() => {
		const query = query$.getValue();
		return query;
	}, [query$]);

	/**
	 *
	 */
	return React.useMemo(() => {
		const queryDebounced$ = query$.pipe(
			skip(1), // skip initial query
			filter((q) => !q.uuid), // HACK: ignore uuid queries
			debounceTime(500),
			map(() => 'QUERY')
		);

		const resync$ = interval(pollingTime).pipe(map(() => 'RESYNC'));

		const combinedStream$ = merge(queryDebounced$, resync$);

		/**
		 * HACK: ideally each endpoint would have it's own replication state
		 * but it means the query$ used in the handler is always from the first Provider to mount
		 * so we need to make sure each unique starting query has it's own replication state
		 *
		 * TODO: is there a way to update the query$ in the handler?
		 */
		const query = query$.getValue();
		const queryHash = JSON.stringify(query);

		const replicationState = replicateRxCollection({
			collection,
			replicationIdentifier: `replication-to-${apiURL}/${endpoint}?${queryHash}`,
			pull: {
				fetchRemoteIDs: async () => {
					/**
					 * TODO: if variation, this should just return the parent.variations
					 */
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
						const localDocs = await collection
							.find({
								selector: { id: { $exists: true } },
							})
							.exec();

						return localDocs;
					} catch (err) {
						log.error(err);
					}
				},
				handler: async (checkpoint, batchSize) => {
					try {
						const query = getLatestQuery();
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
							response = await http.post(endpoint, {
								// signal: controller.signal,
								params,
								data: {
									include: checkpoint.include,
									exclude: checkpoint.exclude,
								},
								headers: {
									'X-HTTP-Method-Override': 'GET',
								},
							});
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
				stream$: combinedStream$,
			},
		});

		return replicationState;
	}, [apiURL, collection, endpoint, http, pollingTime, prepareQueryParams, query$, getLatestQuery]);
};
