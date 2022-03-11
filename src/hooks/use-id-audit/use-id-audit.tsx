import * as React from 'react';
import { replicateRxCollection } from 'rxdb/plugins/replication';
import map from 'lodash/map';
import forEach from 'lodash/forEach';
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
		replicationIdentifier: `${collection.name}-replication`,
		live: true,
		liveInterval: 600000,
		// retryTime: 600000,
		pull: {
			async handler() {
				const result = await http
					.get(collection.name, {
						params: { fields: fields[collection.name], posts_per_page: -1 },
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

				if (!result?.data) {
					return {
						documents: [],
						hasMoreDocuments: false,
					};
				}

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

	replicationState.error$.subscribe((error) => {
		console.log('something was wrong');
		console.dir(error);
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
		const replicationStates = {
			products: getReplicationState(http, storeDB.collections.products),
			// orders: getReplicationState(http, storeDB.collections.orders),
			// customers: getReplicationState(http, storeDB.collections.customers),
		};

		return function cleanUp() {
			forEach(replicationStates, (replicationState) => {
				replicationState.then((result) => {
					result.cancel();
				});
			});
		};
		// only run once
		// @TODO - why does this want to run twice?
	}, []);
};
