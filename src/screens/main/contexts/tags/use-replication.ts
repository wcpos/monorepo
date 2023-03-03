import * as React from 'react';

import { replicateRxCollection } from 'rxdb/plugins/replication';

import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../../contexts/local-data';
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
	const { site } = useLocalData();

	/**
	 *
	 */
	const pushDocument = React.useCallback(
		async (doc) => {
			let endpoint = collection.name;
			if (doc.id) {
				endpoint += `/${doc.id}`;
			}
			try {
				const { data } = await http.post(endpoint, {
					data: await doc.toPopulatedJSON(),
				});
				//
				const parsedData = doc.collection.parseRestResponse(data);
				await collection.upsertRefs(parsedData);
				const latestDoc = doc.getLatest();
				await latestDoc.update(parsedData);
			} catch (err) {
				log.error(err);
			}
		},
		[collection, http]
	);

	/**
	 *
	 */
	const pullDocument = React.useCallback(
		async (id) => {
			let endpoint = collection.name;
			try {
				const { data } = await http.get((endpoint += `/${id}`));
				const parsedData = collection.parseRestResponse(data);
				await collection.upsert(parsedData);
			} catch (err) {
				log.error(err);
			}
		},
		[collection, http]
	);

	/**
	 *
	 */
	const replicationState = React.useMemo(() => {
		/**
		 *
		 */
		const state = replicateRxCollection({
			collection,
			autoStart: false,
			replicationIdentifier: `wc-rest-replication-to-${site.wc_api_url}/${collection.name}`,
			// retryTime: 1000000000,
			pull: {
				async handler(lastCheckpoint, batchSize) {
					const params = {
						// order: 'desc',
						// orderby: 'date',
					};
					const { data } = await http.get(collection.name, { params });

					if (lastCheckpoint) {
						return {
							documents: [],
						};
					}

					return {
						documents: data,
						checkpoint: true,
					};
				},
				batchSize: 10,
				modifier: async (doc) => {
					const parsedData = collection.parseRestResponse(doc);
					return parsedData;
				},
				// stream$: timedObservable(1000),
			},
		});

		return state;
	}, [collection, http, site.wc_api_url]);

	return { replicationState, pushDocument, pullDocument };
};
