import { replicateRxCollection } from 'rxdb/plugins/replication';
import map from 'lodash/map';

export const getAuditIdReplicationState = async (http, collection) => {
	const replicationState = replicateRxCollection({
		collection,
		replicationIdentifier: `${collection.name}-audit-id-replication`,
		live: false,
		pull: {
			async handler(lastCheckpoint, batchSize) {
				const response = await http
					.get(collection.name, {
						params: { fields: ['id', 'firstName', 'lastName'], posts_per_page: batchSize },
					})
					.catch((error) => {
						console.log(error);
					});

				const documents = await collection.auditRestApiIds(response?.data);

				return {
					documents,
					checkpoint: null,
				};
			},
			batchSize: -1,
			async modifier(docData) {
				return collection.parseRestResponse(docData);
			},
		},
	});

	replicationState.error$.subscribe((error) => {
		console.log('something was wrong');
		console.dir(error);
	});

	return replicationState;
};
