import * as React from 'react';

import { find } from 'lodash';
import get from 'lodash/get';
import { replicateRxCollection } from 'rxdb/plugins/replication';

import log from '@wcpos/utils/src/logger';

import useLocalData from '../../../../contexts/local-data';
import { parseLinkHeader } from '../../../../lib/url';
import useRestHttpClient from '../../hooks/use-rest-http-client';

/**
 * Tax Rates replication works a bit differently to other collections
 * Tax Rates are not created locally, so we don't need to use uuids
 * Additionally, tax rates don't have a 'modified' date, so we can't use the
 * modified date to determine if we need to update the local collection.
 *
 * Instead, we download all the tax rates from the server and compare the ids.
 * We set a checkpoint once the replication is complete, but we need to do periodic
 * replications to ensure we have the latest tax rates. There also needs to be an
 * easy way to clear the checkpoint and re-download all tax rates.
 */
export const useReplication = ({ collection }) => {
	const http = useRestHttpClient();
	const { site } = useLocalData();

	const replicationStatePromise = React.useMemo(() => {
		/**
		 *
		 */
		return replicateRxCollection({
			collection,
			autoStart: false,
			replicationIdentifier: `wc-rest-replication-to-${site.wc_api_url}/${collection.name}`,
			pull: {
				async handler(lastCheckpoint, batchSize) {
					try {
						/**
						 * Get custom checkpoint
						 * NOTE - we get all tax rates, so we don't need different checkpoints
						 * for different queries
						 */
						const checkpoint = await collection
							.getLocal('checkpoint')
							.then((doc) => doc?.toJSON().data || {});

						if (checkpoint.fullInitialSync) {
							// if fullInitialSync is done we need to audit, not replicate
							// 	collection
							// 		.find()
							// 		.exec()
							// 		.then((docs) => docs.map((d) => d.id))
							return {
								documents: [],
								checkpoint: null,
							};
						}

						const params = {
							per_page: batchSize,
							page: checkpoint ? checkpoint.nextPage : 1,
						};
						const response = await http.get(collection.name, { params });
						const data = get(response, 'data', []);
						const link = get(response, ['headers', 'link']);
						const remoteTotal = get(response, ['headers', 'x-wp-total']);
						const totalPages = get(response, ['headers', 'x-wp-totalpages']);
						const parsedHeaders = parseLinkHeader(link);
						const nextPage = get(parsedHeaders, ['next', 'page']);

						/**
						 * Set next checkpoint, using my own custom checkpoint
						 */
						await collection.upsertLocal('checkpoint', {
							remoteTotal,
							totalPages,
							nextPage,
							fullInitialSync: !nextPage,
						});

						return {
							documents: data,
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
