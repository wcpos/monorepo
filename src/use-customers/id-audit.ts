import { replicateRxCollection } from 'rxdb/plugins/replication';
import map from 'lodash/map';

export const getAuditIdReplicationState = async (http, collection) => {
	const replicationState = replicateRxCollection({
		collection,
		replicationIdentifier: `${collection.name}-audit-id-replication`,
		live: true,
		liveInterval: 600000,
		// retryTime: 600000,
		pull: {
			async handler() {
				const result = await http
					.get(collection.name, {
						params: { fields: ['id', 'firstName', 'lastName'], posts_per_page: -1 },
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
