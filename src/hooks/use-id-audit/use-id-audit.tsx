import * as React from 'react';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import map from 'lodash/map';
import useRestHttpClient from '../use-rest-http-client';
import useAppState from '../use-app-state';

type CollectionNames = 'products' | 'customers' | 'orders';

const fields = {
	products: ['id', 'name'],
	customers: ['id', 'firstName', 'lastName'],
	orders: ['id'],
};

/**
 *
 */
const getReplicationState = async (http, collection) => {
	const replicationState = await replicateRxCollection({
		collection,
		replicationIdentifier: 'product-replication',
		live: true,
		liveInterval: 600000,
		retryTime: 600000,
		pull: {
			async handler() {
				const result = await http
					.get('products', {
						params: { fields: fields.products, posts_per_page: -1 },
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

				const data = await collection.auditRestApiIds(result?.data);
				const documents = map(data, (item) => collection.parseRestResponse(item));
				// @TODO - handle mapping in parseRestResponse?

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
export const useIdAudit = () => {
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
