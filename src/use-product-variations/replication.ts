import { replicateRxCollection } from 'rxdb/plugins/replication';
import map from 'lodash/map';

export const getReplicationState = async (http, collection, parent) => {
	const replicationState = replicateRxCollection({
		collection,
		replicationIdentifier: `${collection.name}-replication`,
		live: false,
		retryTime: 5000,
		pull: {
			async handler(lastCheckpoint, batchSize) {
				const variations = await parent.populate('variations');
				const pullRemoteIds = [];
				const syncedIds = [];

				if (variations.length !== parent.variations.length) {
					throw Error('Mismatch between parent variations and database');
				}

				variations.forEach((variation) => {
					if (variation.date_modified_gmt) {
						syncedIds.push(variation.id);
					} else {
						pullRemoteIds.push(variation.id);
					}
				});

				if (pullRemoteIds.length === 0) {
					return {
						documents: [],
						checkpoint: null,
					};
				}

				const params = {};

				// choose the smallest array, max of 1000
				if (syncedIds.length > pullRemoteIds.length) {
					params.include = pullRemoteIds.slice(0, 1000).join(',');
				} else {
					params.exclude = syncedIds.slice(0, 1000).join(',');
				}

				const response = await http
					.get(`products/${parent.id}/variations`, {
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
		console.log('something was wrong');
		if (error.parameters.errors) {
			error.parameters.errors.forEach((err) => {
				console.error(err);
			});
		} else {
			console.dir(error);
		}
	});

	return replicationState;
};
