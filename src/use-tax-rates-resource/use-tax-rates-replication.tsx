import * as React from 'react';
import map from 'lodash/map';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import useRestHttpClient from '../use-rest-http-client';
import useAppState from '../use-app-state';

export const useTaxRatesReplication = () => {
	const http = useRestHttpClient();
	const { storeDB } = useAppState();
	const collection = storeDB.collections.taxes;

	React.useEffect(() => {
		const replicationState = replicateRxCollection({
			collection,
			replicationIdentifier: 'tax-rates-replication',
			live: false,
			// liveInterval: 10000,
			retryTime: 10000000,
			pull: {
				async handler(latestPullDocument) {
					const result = await http.get(collection.name).catch(({ response }) => {
						console.log(response);
					});

					// const documents = result?.data;
					// @TODO - why aren't documents being parsed on insert
					const documents = map(result?.data, (item) => collection.parseRestResponse(item));
					await Promise.all(map(documents, (doc) => collection.upsert(doc)));

					return {
						documents: [],
						hasMoreDocuments: false,
					};
				},
			},
		});

		replicationState.error$.subscribe((error) => {
			console.log('something was wrong');
			console.dir(error);
		});
	}, []);
};
