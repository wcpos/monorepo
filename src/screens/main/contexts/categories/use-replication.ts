import * as React from 'react';

import uniq from 'lodash/uniq';
import { replicateRxCollection } from 'rxdb/plugins/replication';

import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../../contexts/local-data';
import useRestHttpClient from '../../hooks/use-rest-http-client';

/**
 *
 */
export const useReplication = ({ collection }) => {
	const http = useRestHttpClient();
	const { site } = useLocalData();

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
					const status = await collection
						.getLocal('status')
						.then((doc) => doc?.toJSON().data || {});

					/**
					 * Tags has a page count, but not a modified date, so we will exclude existing ids instead
					 */
					const params = {
						exclude: (status.ids || []).join(','),
					};

					const { data } = await http.get(collection.name, { params });

					/**
					 * Set next checkpoint, using my own custom checkpoint
					 */
					const newIds = data.map((item) => item.id);
					await collection.upsertLocal('status', {
						ids: uniq([...(status.ids || []), ...newIds]),
					});

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

	return { replicationState };
};
