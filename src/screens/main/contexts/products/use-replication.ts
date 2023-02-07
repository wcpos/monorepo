import * as React from 'react';

import get from 'lodash/get';
import { replicateRxCollection } from 'rxdb/plugins/replication';

import log from '@wcpos/utils/src/logger';

import useAuth from '../../../../contexts/auth';
import { parseLinkHeader } from '../../../../lib/url';
import useRestHttpClient from '../../hooks/use-rest-http-client';

/**
 * Hack, I want the replication to wait before looping to allow counts to be updated
 */
function wait(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 *
 */
export const useReplication = ({ collection }) => {
	const http = useRestHttpClient();
	const { site } = useAuth();

	const replicationStatePromise = React.useMemo(() => {
		/**
		 *
		 */
		return replicateRxCollection({
			collection,
			autoStart: false,
			replicationIdentifier: `wc-rest-replication-to-${site.wc_api_url}/${collection.name}`,
			// retryTime: 1000000000,
			pull: {
				async handler(lastCheckpoint = {}, batchSize) {
					try {
						const params = {
							order: 'asc',
							orderby: 'title',
							page: lastCheckpoint.nextPage ? lastCheckpoint.nextPage : 1,
							per_page: batchSize,
						};
						const response = await http.get(collection.name, { params });
						const data = get(response, 'data', []);
						const link = get(response, ['headers', 'link']);
						const parsedHeaders = parseLinkHeader(link);
						const nextPage = get(parsedHeaders, ['next', 'page']);
						return {
							documents: data,
							checkpoint: {
								nextPage,
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
				// stream$: timedObservable(1000),
			},
		});
	}, [collection, http, site.wc_api_url]);

	return replicationStatePromise;
};
