import * as React from 'react';

import { find } from 'lodash';
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

const runAudit = true;

export const useReplication = ({ collection }) => {
	const http = useRestHttpClient();
	const { site } = useAuth();
	const runAudit = React.useRef(true);

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
				async handler(lastCheckpoint, batchSize) {
					try {
						/**
						 * TODO - getting the localIds returns stale data so we need to wait
						 * Need to find a better way to do this
						 * Is the collection not updated yet? or is find() being cached?
						 *
						 * NOTE - this is similar to gateways, but we need pagination
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
						// NOTE - rest api ids are integers, local ids are strings
						const add = data
							.filter((d) => !localIds.includes(String(d.id)))
							.map((d) => ({ ...d, _deleted: false }));

						const remove = localIds
							.filter((id) => !find(data, { id: Number(id) }))
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
				batchSize: 10,
				modifier: (doc) => {
					return collection.parseRestResponse(doc);
				},
				// stream$: timedObservable(1000),
			},
		});
	}, [collection, http, site.wc_api_url]);

	return replicationStatePromise;
};
