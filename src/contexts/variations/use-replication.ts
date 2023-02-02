import * as React from 'react';

import intersection from 'lodash/intersection';
import { replicateRxCollection } from 'rxdb/plugins/replication';

import log from '@wcpos/utils/src/logger';

import useRestHttpClient from '../../hooks/use-rest-http-client';
import useAuth from '../auth';

/**
 * Hack, I want the replication to wait before looping to allow counts to be updated
 */
function wait(milliseconds: number) {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export const useReplication = ({ collection, parent }) => {
	const http = useRestHttpClient();
	const { site } = useAuth();

	const replicationStatePromise = React.useMemo(() => {
		/**
		 *
		 */
		const audit = async () => {
			log.silly('audit');
		};

		/**
		 *
		 */
		const replicate = async (lastCheckpoint, batchSize) => {
			/**
			 * This is the data replication
			 * we need to delay for a little while to allow the collection count to be updated
			 */
			await wait(1000);
			const pullRemoteIds = collection.pullRemoteIds$.getValue();
			const syncedDocs = collection.syncedIds$.getValue();
			const variationIds = parent.variations.map((id) => +id);
			const include = intersection(pullRemoteIds, variationIds);

			if (include.length === 0) {
				return {
					documents: [],
					checkpoint: { audit: false },
				};
			}

			/**
			 * @TODO - transform arrays to strings in axios?
			 */
			const params = {
				include: include.join(','),
			};

			const response = await http
				.get(`products/${parent.id}/${collection.name}`, { params })
				.catch((error) => {
					log.error(error);
				});

			/**
			 * What to do when server is unreachable?
			 */
			if (!response?.data) {
				throw Error('No response from server');
			}

			return {
				documents: response?.data || [],
				checkpoint: { audit: false },
			};
		};

		/**
		 *
		 */
		return replicateRxCollection({
			collection,
			autoStart: false,
			replicationIdentifier: `wc-rest-replication-to-${site.wc_api_url}/products/${parent.id}/${collection.name}`,
			// retryTime: 1000000000,
			pull: {
				async handler(lastCheckpoint, batchSize) {
					try {
						const { data } = await http.get(`products/${parent.id}/${collection.name}`);
						return {
							documents: data,
							checkpoint: true,
						};
					} catch (err) {
						throw new Error(err);
					}
				},
				batchSize: 10,
				modifier: async (doc) => {
					return collection.parseRestResponse(doc);
				},
				// stream$: timedObservable(1000),
			},
		});
	}, [collection, http, parent.id, parent.variations, site.wc_api_url]);

	return replicationStatePromise;
};
