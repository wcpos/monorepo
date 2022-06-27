import { replicateRxCollection } from 'rxdb/plugins/replication';
import map from 'lodash/map';

export const getReplicationState = async (http, collection) => {
	const replicationState = replicateRxCollection({
		collection,
		replicationIdentifier: `${collection.name}-replication`,
		live: true,
		liveInterval: 600000,
		retryTime: 5000,
		pull: {
			async handler() {
				const unsyncedDocs = collection.unsyncedIds$.getValue();
				const syncedDocs = collection.syncedIds$.getValue();

				if (unsyncedDocs.length > 0) {
					const params = {
						order: 'desc',
						orderby: 'date',
					};

					// choose the smallest array, max of 1000
					if (syncedDocs.length > unsyncedDocs.length) {
						params.include = unsyncedDocs.slice(0, 1000).join(',');
					} else {
						params.exclude = syncedDocs.slice(0, 1000).join(',');
					}

					const result = await http
						.get(collection.name, {
							params,
						})
						.catch(({ response }) => {
							console.log(response);
						});

					const documents = map(result?.data, (item) => collection.parseRestResponse(item));
					await collection.bulkUpsert(documents).catch(() => {
						debugger;
					});
					// await Promise.all(map(documents, (doc) => collection.atomicUpsert(doc))).catch(() => {
					// 	debugger;
					// });
				}

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

	return replicationState;
};
