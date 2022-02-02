import * as React from 'react';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import useRestHttpClient from '../use-rest-http-client';
import useAppState from '../use-app-state';

/**
 *
 */
const getReplicationState = async (http, collection) => {
	const replicationState = await replicateRxCollection({
		collection,
		replicationIdentifier: 'product-replication',
		live: true,
		liveInterval: 600000,
		pull: {
			async handler(latestPullDocument) {
				console.log('latestPullDocument', latestPullDocument);

				const result = await http
					.get('products', {
						params: { foo: 'bar' },
					})
					.catch(({ response }) => {
						console.log(response);
						// if (!response) {
						// 	console.error('CORS error');
						// 	return;
						// }
						// if (response.status === 401) {
						// 	// @ts-ignore
						// 	navigation.navigate('Login');
						// }
						// if (response.status === 403) {
						// 	console.error('invalid nonce');
						// }
					});

				const documents = result?.data || [];
				console.log('documents', documents);

				debugger;
				return {
					documents,
					hasMoreDocuments: false,
				};
			},
		},
	});

	return replicationState;
};

/**
 *
 */
export const useStoreSync = () => {
	const http = useRestHttpClient();
	const { storeDB } = useAppState();

	React.useEffect(() => {
		const replicationState = getReplicationState(http, storeDB.collections.products);

		return function cleanUp() {
			replicationState.then((result) => {
				result.cancel();
			});
		};
		// only run once
	}, []);
};
