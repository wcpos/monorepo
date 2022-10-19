import * as React from 'react';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import useRestHttpClient from '@wcpos/hooks/src/use-rest-http-client';
import useAuth from '@wcpos/hooks/src/use-auth';

export const useReplication = ({ collection }) => {
	const http = useRestHttpClient();
	const { site } = useAuth();

	const replicationStatePromise = React.useMemo(() => {
		return replicateRxCollection({
			collection,
			replicationIdentifier: `wc-rest-replication-to-${site.wc_api_url}/${collection.name}`,
			retryTime: 1000000000,
			pull: {
				async handler(lastCheckpoint, batchSize) {
					const response = await http
						.get(collection.name, {
							params: { fields: ['id', 'name'], posts_per_page: -1 },
						})
						.catch((error) => {
							console.log(error);
						});

					/**
					 * What to do when server is unreachable?
					 */
					if (!response?.data) {
						throw Error('No response from server');
					}

					const documents = await collection.auditRestApiIds(response?.data);

					//
					return {
						documents,
						checkpoint: { id: '123', updatedAt: 12342878678 },
					};
				},
				batchSize: 100,
				modifier: (doc) => collection.parseRestResponse(doc),
				// stream$: timedObservable(1000),
			},
		});
	}, [collection, http, site.wc_api_url]);

	return replicationStatePromise;
};
