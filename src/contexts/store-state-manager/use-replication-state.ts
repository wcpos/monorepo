import * as React from 'react';

import get from 'lodash/get';
import { useObservableState, useObservable } from 'observable-hooks';
import { interval, merge } from 'rxjs';
import { map, tap, throttleTime } from 'rxjs/operators';

import { replicateRxCollection } from '@wcpos/database/src/plugins/wc-rest-api-replication';
import log from '@wcpos/utils/src/logger';

import useRestHttpClient from '../../hooks/use-rest-http-client';
import { useAppState } from '../app-state';

import type { Query, QueryState } from './query';
import type { RxCollection, RxDocument } from 'rxdb';

interface Props {
	collection: RxCollection;
	query: Query<RxCollection>;
	pollingTime?: number;
	hooks?: any;
	parent?: RxDocument;
}

/**
 *
 */
export const useReplicationState = ({
	collection,
	query,
	pollingTime = 600000,
	hooks,
	parent,
}: Props) => {
	const { site } = useAppState();
	const apiURL = useObservableState(site.wc_api_url$, site.wc_api_url);
	const endpoint = hooks?.filterApiEndpoint
		? hooks?.filterApiEndpoint(collection, parent)
		: collection.name;
	const http = useRestHttpClient();

	/**
	 * Create a long polling stream
	 */
	// const poll$ = useObservable(() => interval(pollingTime).pipe(map(() => 'RESYNC')));

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
					if (hooks?.fetchRemoteIDs) {
						return hooks?.fetchRemoteIDs(parent);
					}

					// otherwise, fetch from API
					try {
						const response = await http.get(endpoint, {
							params: { fields: ['id'], posts_per_page: -1 },
						});

						const data = get(response, 'data');

						// Check if data is an array and its items have a property 'id' of type number
						if (Array.isArray(data) && data.every((item) => typeof item.id === 'number')) {
							return data.map((doc) => doc.id);
						}

						throw new Error('Fetch remote IDs failed');
					} catch (err) {
						log.error(err);
						throw err;
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
				audit: async ({ include, exclude, remove }) => {
					if (remove.length > 0 && collection.name !== 'variations') {
						// deletion should be rare, only when an item is deleted from the server
						log.warn('removing', remove, 'from', collection.name);
						await collection.find({ selector: { id: { $in: remove } } }).remove();
					}
				},
				handler: async (checkpoint, batchSize) => {
					try {
						let params = query.getApiQueryParams();
						if (hooks?.filterApiQueryParams) {
							params = hooks.filterApiQueryParams(params, checkpoint, batchSize);
						}

						/**
						 * If params hook returns false, don't fetch
						 */
						if (!params) {
							return {
								documents: [],
								checkpoint,
							};
						}

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
									// exclude: checkpoint.exclude, // do we need exclude?
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
				stream$: merge(interval(pollingTime), query.state$).pipe(
					map(() => 'RESYNC'),
					/**
					 * Important: throttleTime is used to prevent multiple server requests from being sent
					 */
					throttleTime(1000, undefined, { leading: true, trailing: false })
				),
			},
		});
	}, [apiURL, collection, endpoint, hooks, http, parent, pollingTime, query]);

	return replicationState;
};
