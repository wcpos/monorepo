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
						params: { fields: ['id'], posts_per_page: batchSize },
					})
					.catch((error) => {
						console.log(error);
					});

				/**
				 * What to do when server is unreachable?
				 */
				if (!response?.data) {
					throw Error('No response from server');
				}

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
		if (error?.errors && Array.isArray(error.errors)) {
			error.errors.map((err) => {
				console.error(err);
			});
		} else {
			console.dir(error);
		}
	});

	return replicationState;
};
