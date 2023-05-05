import * as React from 'react';

import { find } from 'lodash';
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

export const useReplication = ({ collection }) => {
	const http = useRestHttpClient();
	const { site } = useLocalData();
	// const runAudit = React.useRef(true);

	const replicationStatePromise = React.useMemo(() => {
		/**
		 * Payment gateways endpoint always returns all gateways
		 * so we need to do the audit and replicate all in one
		 */
		const auditAndReplicate = async () => {
			/**
			 * This is the data replication
			 * we need to delay for a little while to allow the collection count to be updated
			 */
			// await wait(1000);
			// const pullRemoteIds = collection.pullRemoteIds$.getValue(); // throws error
			// const syncedDocs = collection.syncedIds$.getValue();

			const response = await http.get(collection.name).catch((error) => {
				log.error(error);
			});

			/**
			 * What to do when server is unreachable?
			 */
			if (!response?.data) {
				throw Error('No response from server');
			}

			const data = response.data;

			// compare local and server ids
			const add = data
				.filter((d) => !pullRemoteIds.includes(d.id))
				.map((d) => ({ ...d, _deleted: false }));

			const remove = pullRemoteIds
				.filter((id) => !find(data, { id }))
				.map((d) => ({ ...d.toJSON(), _deleted: true }));

			//
			const documents = add.concat(remove);

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
				async handler() {
					try {
						/**
						 * TODO - getting the localIds returns stale data so we need to wait
						 * Need to find a better way to do this
						 * Is the collection not updated yet? or is find() being cached?
						 */
						await wait(1000);
						const [{ data }, localIds] = await Promise.all([
							http.get(collection.name),
							collection
								.find()
								.exec()
								.then((docs) => docs.map((d) => d.id)),
						]);

						// compare local and server ids
						const add = data
							.filter((d) => !localIds.includes(d.id))
							.map((d) => ({ ...d, _deleted: false }));

						const remove = localIds
							.filter((id) => !find(data, { id }))
							.map((d) => ({ ...d.toJSON(), _deleted: true }));

						//
						const documents = add.concat(remove);

						return {
							documents,
							checkpoint: null,
						};
					} catch (err) {
						log.error(err);
					}
				},
				batchSize: 1000, // rest api always returns all gateways
				modifier: async (doc) => {
					return collection.parseRestResponse(doc);
				},
				// stream$: timedObservable(1000),
			},
		});
	}, [collection, http, site.wc_api_url]);

	return replicationStatePromise;
};
