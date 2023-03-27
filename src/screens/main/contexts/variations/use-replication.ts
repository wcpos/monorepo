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

export const useReplication = ({ parent, query$ }) => {
	const http = useRestHttpClient();
	const { site, storeDB } = useLocalData();
	const collection = storeDB.collections.variations;
	const query = useObservableState(query$, query$.getValue());

	const replicationStatePromise = React.useMemo(() => {
		/**
		 * TODO: instead of using the registry, maybe I should use the replicationIdentifier?
		 * I think this will create a new db table for every query though, which sucks
		 */
		const hash = defaultHashSha256(
			JSON.stringify({
				// TODO: I need to take a good look at the 'slug' option for REST resquests
				// ...query, // NOTE: I've taken this out because there no sensible filters for the REST API, it gets all variations
				parentID: parent.id,
			})
		);
		if (registry.has(hash)) {
			return registry.get(hash);
		}

		/**
		 *
		 */
		const state = replicateRxCollection({
			collection,
			autoStart: false,
			replicationIdentifier: `wc-rest-replication-to-${site.wc_api_url}/products/${parent.id}/${collection.name}`,
			// retryTime: 1000000000,
			pull: {
				async handler() {
					try {
						const checkpoint = await collection
							.getLocal(hash)
							.then((doc) => doc?.toJSON().data || {});

						const selector = mangoToRestQuery(query);
						const emptyRestQuery = isEmpty(selector);
						const params = Object.assign(selector, {
							// order: query.sortDirection,
							// WC REST API doesn't use the name property, it uses 'title', because of course it does
							// orderby: query.sortBy === 'name' ? 'title' : query.sortBy,
							page: checkpoint.nextPage || 1,
							per_page: 10,
							after: checkpoint.fullInitialSync ? checkpoint.lastModified : null,
						});
						const response = await http.get(`products/${parent.id}/${collection.name}`, { params });
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

						const newCheckpoint = {
							remoteTotal,
							totalPages,
							nextPage,
							date_modified_gmt: mostRecent.date_modified_gmt,
						};

						/**
						 * Set next checkpoint, using my own custom checkpoint
						 */
						await collection.upsertLocal(hash, newCheckpoint);

						/**
						 * How to determine if fullInitialSync
						 */
						const fullInitialSync = emptyRestQuery && !nextPage;
						if (fullInitialSync) {
							await collection.upsertLocal(hash, {
								...newCheckpoint,
								fullInitialSync,
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
				// stream$: timedObservable(1000),
			},
		});

		registry.set(hash, state);
		return state;
	}, [collection, http, parent.id, query, site.wc_api_url]);

	return replicationStatePromise;
};
