import * as React from 'react';

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

export const useReplication = ({ collection }) => {
	const http = useRestHttpClient();
	const { site } = useAuth();
	const runAudit = React.useRef(true);

	const replicationStatePromise = React.useMemo(() => {
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

			if (pullRemoteIds.length === 0) {
				runAudit.current = true;
				return {
					documents: [],
					checkpoint: null,
				};
			}

			const params = {
				order: 'desc',
				orderby: 'date',
			};

			// choose the smallest array, max of 1000
			if (syncedDocs.length > pullRemoteIds.length) {
				params.include = pullRemoteIds.slice(0, 1000).join(',');
			} else {
				params.exclude = syncedDocs.slice(0, 1000).join(',');
			}

			const response = await http.get(collection.name, { params }).catch((error) => {
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
				checkpoint: null,
			};
		};

		/**
		 *
		 */
		const audit = async () => {
			const response = await http
				.get(collection.name, {
					params: { fields: ['id'], posts_per_page: -1 },
				})
				.catch((error) => {
					log.error(error);
				});

			/**
			 * What to do when server is unreachable?
			 */
			if (!response?.data) {
				throw Error('No response from server');
			}

			const documents = await collection.auditRestApiIds(response?.data);
			runAudit.current = false;

			/** @TODO - hack */
			if (documents.length === 0) {
				return replicate(null, 10);
			}

			return {
				documents,
				checkpoint: null,
			};
		};

		/**
		 *
		 */
		return replicateRxCollection({
			collection,
			autoStart: false,
			replicationIdentifier: `wc-rest-replication-to-${site.wc_api_url}/${collection.name}`,
			// retryTime: 1000000000,
			pull: {
				async handler(lastCheckpoint, batchSize) {
					return runAudit.current ? audit() : replicate(lastCheckpoint, batchSize);
				},
				batchSize: 10,
				modifier: async (doc) => {
					await collection.upsertChildren(doc);
					return collection.parseRestResponse(doc);
				},
				// stream$: timedObservable(1000),
			},
		});
	}, [collection, http, site.wc_api_url]);

	return replicationStatePromise;
};
