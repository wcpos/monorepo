import { replicateRxCollection } from 'rxdb/plugins/replication';
import map from 'lodash/map';

export const getReplicationState = async (http, collection) => {
	const replicationState = replicateRxCollection({
		collection,
		replicationIdentifier: `${collection.name}-replication`,
		live: false,
		retryTime: 5000,
		pull: {
			async handler(lastCheckpoint, batchSize) {
				const unsyncedDocs = collection.unsyncedIds$.getValue();
				const syncedDocs = collection.syncedIds$.getValue();

				if (unsyncedDocs.length === 0) {
					return {
						documents: [],
						checkpoint: null,
					};
				}

				const params = {
					order: 'asc',
					orderby: 'title',
				};

				// choose the smallest array, max of 1000
				if (syncedDocs.length > unsyncedDocs.length) {
					params.include = unsyncedDocs.slice(0, 1000).join(',');
				} else {
					params.exclude = syncedDocs.slice(0, 1000).join(',');
				}

				const response = await http
					.get(collection.name, {
						params,
					})
					.catch((error) => {
						debugger;
						console.log(error);
					});

				return {
					documents: response?.data || [],
					checkpoint: null,
				};
			},
			batchSize: 10,
			async modifier(docData) {
				return collection.parseRestResponse(docData);
			},
		},
	});

	replicationState.error$.subscribe((error) => {
		debugger;
		console.log('something was wrong');
		console.dir(error);
	});

	return replicationState;
};
