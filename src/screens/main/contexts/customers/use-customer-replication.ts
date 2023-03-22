import * as React from 'react';

import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import { useObservableState } from 'observable-hooks';
import { defaultHashSha256 } from 'rxdb';
import { replicateRxCollection } from 'rxdb/plugins/replication';

import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../../contexts/local-data';
import { parseLinkHeader } from '../../../../lib/url';
import useRestHttpClient from '../../hooks/use-rest-http-client';

interface Props {
	params?: Record<string, any>;
}

const registry = new Map();

function mapKeyToParam(key) {
	return key;
}

function mangoToRestQuery(mangoSelector) {
	const restQuery = {};
	if (!mangoSelector.selector) {
		return restQuery;
	}
	for (const [key, value] of Object.entries(mangoSelector.selector)) {
		const param = mapKeyToParam(key);
		if (typeof value === 'object' && '$elemMatch' in value) {
			restQuery[param] = value.$elemMatch.id;
		} else {
			restQuery[param] = value;
		}
	}
	return restQuery;
}

/**
 *
 */
const useCustomerReplication = (query$) => {
	const http = useRestHttpClient();
	const { site, storeDB } = useLocalData();
	const collection = storeDB.collections.customers;
	const query = useObservableState(query$, query$.getValue());

	/**
	 *
	 */
	const replicationState = React.useMemo(() => {
		const hash = defaultHashSha256(JSON.stringify(query));
		if (registry.has(hash)) {
			return registry.get(hash);
		}

		/**
		 *
		 */
		const state = replicateRxCollection({
			collection,
			// autoStart: false,
			replicationIdentifier: `wc-rest-replication-to-${site.wc_api_url}/${collection.name}`,
			// retryTime: 1000000000,
			pull: {
				// initialCheckpoint,
				/**
				 * TODO: Checkpoint is not working as expected
				 * I will keep my own checkpoint in the local db
				 */
				async handler() {
					try {
						const checkpoint = await collection
							.getLocal(hash)
							.then((doc) => doc?.toJSON().data || {});
						const status = await collection
							.getLocal('status')
							.then((doc) => doc?.toJSON().data || {});

						const selector = mangoToRestQuery(query);
						const emptyRestQuery = isEmpty(selector);
						const params = Object.assign(selector, {
							order: query.sortDirection,
							// TODO: I need to add orderby to the WC REST API
							orderby: query.sortBy === 'last_name' ? 'name' : query.sortBy,
							page: checkpoint.nextPage || 1,
							per_page: 10,
							after: status.fullInitialSync ? status.lastModified : null,
							role: 'all',
						});
						const response = await http.get(collection.name, { params });
						const data = get(response, 'data', []);
						const link = get(response, ['headers', 'link']);
						const remoteTotal = get(response, ['headers', 'x-wp-total']);
						const totalPages = get(response, ['headers', 'x-wp-totalpages']);
						const parsedHeaders = parseLinkHeader(link);
						const nextPage = get(parsedHeaders, ['next', 'page']);

						//
						const mostRecent = data.reduce((prev, current) => {
							const prevDate = new Date(prev.date_modified_gmt);
							const currentDate = new Date(current.date_modified_gmt);
							return prevDate > currentDate ? prev : current;
						}, checkpoint);

						/**
						 * Set next checkpoint, using my own custom checkpoint
						 */
						await collection.upsertLocal(hash, {
							remoteTotal,
							totalPages,
							nextPage,
							date_modified_gmt: mostRecent.date_modified_gmt,
						});

						/**
						 * Set flag on initial full sync
						 */
						if (emptyRestQuery && !nextPage) {
							// NOTE: make sure lastModified is set, otherwise it will loop forever
							const lastModified =
								mostRecent.date_modified_gmt || new Date(Date.now()).toISOString().split('.')[0];

							await collection.upsertLocal('status', {
								fullInitialSync: true,
								lastModified,
							});
						}

						/**
						 * If no more pages, then use date_modified_gmt
						 * or, if total records is same as local count
						 */
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
				// stream$: interval(1000),
			},
		});

		registry.set(hash, state);
		return state;
	}, [collection, http, query, site.wc_api_url]);

	/**
	 * Clear
	 */
	const clear = React.useCallback(async () => {
		await collection.remove();
		const promises = [];
		registry.forEach((value, key) => {
			promises.push(collection.upsertLocal(key, {}));
		});
		promises.push(collection.upsertLocal('status', {}));
		return Promise.all(promises);
	}, [collection]);

	/**
	 * Sync
	 */
	const sync = React.useCallback(() => {
		replicationState.reSync();
	}, [replicationState]);

	/**
	 *
	 */
	return { replicationState, clear, sync };
};

export default useCustomerReplication;
