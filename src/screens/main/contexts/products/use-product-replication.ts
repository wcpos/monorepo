import * as React from 'react';

import get from 'lodash/get';
import isEmpty from 'lodash/isEmpty';
import { useObservableState } from 'observable-hooks';
import { defaultHashSha256, removeCollectionStorages } from 'rxdb';
import { replicateRxCollection } from 'rxdb/plugins/replication';

import { addStoreDBCollection } from '@wcpos/database';
import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../../contexts/local-data';
import { parseLinkHeader } from '../../../../lib/url';
import useProductsCollection from '../../hooks/use-products-collection';
import useRestHttpClient from '../../hooks/use-rest-http-client';

interface Props {
	params?: Record<string, any>;
}

/**
 * NOTE: This registry will hang around for the life of the app!!
 * ie: if you switch wpUsers or stores etc ... do I want this?
 */
const registry = new Map();

function mapKeyToParam(key) {
	if (key === 'categories') {
		return 'category';
	} else if (key === 'tags') {
		return 'tag';
	} else {
		return key;
	}
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
const useProductReplication = (query$) => {
	const http = useRestHttpClient();
	const { site, store } = useLocalData();
	const collection = useProductsCollection();
	const query = useObservableState(query$, query$.getValue());

	/**
	 *
	 */
	const replicationState = React.useMemo(() => {
		/**
		 * TODO: instead of using the registry, I should use the replicationIdentifier
		 */
		const hash = defaultHashSha256(JSON.stringify({ storeID: store.localID, query }));
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
							// WC REST API doesn't use the name property, it uses 'title', because of course it does
							orderby: query.sortBy === 'name' ? 'title' : query.sortBy,
							page: checkpoint.nextPage || 1,
							per_page: 10,
							after: status.fullInitialSync ? status.lastModified : null,
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
	}, [collection, http, query, site.wc_api_url, store.localID]);

	/**
	 * Clear
	 * TODO - it should clear the variations collection too
	 */
	const clear = React.useCallback(async () => {
		async function removeWithTimeout(retryTimeout, maxRetries) {
			let retries = 0;

			while (retries < maxRetries) {
				try {
					// Race between the destroy() function and a timeout promise
					collection.destroyed = false;
					const result = await Promise.race([
						collection.remove(),
						new Promise((_, reject) =>
							setTimeout(() => reject(new Error('Timeout')), retryTimeout)
						),
					]);

					// If destroy() resolved before the timeout, return the result
					return result;
				} catch (error) {
					if (error.message === 'Timeout') {
						console.warn(`Attempt ${retries + 1} timed out, retrying...`);
						retries++;
					} else {
						// If an error other than timeout occurs, throw the error
						throw error;
					}
				}
			}

			throw new Error(`Failed after ${maxRetries} attempts`);
		}

		try {
			await removeWithTimeout(200, 5);
		} catch (error) {
			log.error(error);
		}

		return addStoreDBCollection(store.localID, 'products');
	}, [collection, store.localID]);

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

export default useProductReplication;
