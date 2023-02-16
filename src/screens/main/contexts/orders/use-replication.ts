import * as React from 'react';

import { replicateRxCollection } from 'rxdb/plugins/replication';

import log from '@wcpos/utils/src/logger';

import useAuth from '../../../../contexts/auth';
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
						order: 'desc',
						orderby: 'date',
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
					await collection.upsertRefs(parsedData); // upsertRefs mutates the parsedData
					return parsedData;
				},
				// stream$: timedObservable(1000),
			},
		});

		return state;
	}, [collection, http, site.wc_api_url]);

	return replicationState;
};
