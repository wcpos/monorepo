import * as React from 'react';

import get from 'lodash/get';
import { defaultHashSha256 } from 'rxdb';
import { replicateRxCollection } from 'rxdb/plugins/replication';

import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../contexts/local-data';
import { parseLinkHeader } from '../../../lib/url';
import useRestHttpClient from '../hooks/use-rest-http-client';

interface Props {
	params?: Record<string, any>;
}

const registry = new Map();

/**
 *
 */
const useOrderReplication = (props?: Props = { params: { order: 'desc', orderby: 'date' } }) => {
	const http = useRestHttpClient();
	const { site, storeDB } = useLocalData();
	const collection = storeDB.collections.orders;

	/**
	 *
	 */
	const replicationState = React.useMemo(() => {
		const hash = defaultHashSha256(JSON.stringify(props.params));
		if (registry.has(hash)) {
			return registry.get(hash);
		}

		/**
		 *
		 */
		const state = replicateRxCollection({
			collection,
			autoStart: false,
			replicationIdentifier: `wc-rest-replication-to-${site.wc_api_url}/${collection.name}`,
			// retryTime: 1000000000,
			pull: {
				async handler(lastCheckpoint = {}, batchSize) {
					try {
						const checkpoint = get(lastCheckpoint, hash, {});
						const params = Object.assign(props.params, {
							page: checkpoint.nextPage ? checkpoint.nextPage : 1,
							per_page: batchSize,
							after: checkpoint.date_modified_gmt,
						});
						const response = await http.get(collection.name, { params });
						const data = get(response, 'data', []);
						const link = get(response, ['headers', 'link']);
						const remoteTotal = get(response, ['headers', 'x-wp-total']);
						const totalPages = get(response, ['headers', 'x-wp-totalpages']);
						const parsedHeaders = parseLinkHeader(link);
						const nextPage = get(parsedHeaders, ['next', 'page']);

						const mostRecent = data.reduce((prev, current) => {
							const prevDate = new Date(prev.date_modified_gmt);
							const currentDate = new Date(current.date_modified_gmt);
							return prevDate > currentDate ? prev : current;
						}, lastCheckpoint);

						return {
							documents: data,
							checkpoint: {
								[hash]: {
									remoteTotal,
									totalPages,
									nextPage,
									date_modified_gmt: mostRecent.date_modified_gmt,
								},
							},
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
	}, [collection, http, props.params, site.wc_api_url]);

	/**
	 *
	 */
	// React.useEffect(() => {
	// 	replicationState.start();
	// 	return () => {
	// 		// this is async, should we wait?
	// 		replicationState.cancel();
	// 	};
	// }, [replicationState]);

	/**
	 * Clear
	 */
	const clear = React.useCallback(async () => {
		const query = collection.find();
		return query.remove();
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

export default useOrderReplication;
