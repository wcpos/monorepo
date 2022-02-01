import forEach from 'lodash/forEach';
import find from 'lodash/find';
import pull from 'lodash/pull';
import map from 'lodash/map';

type RxCollection = import('rxdb/dist/types').RxCollection;

/**
 * Match ids from server and local database
 * @TODO - works only on pouch internals, make general
 */
export async function auditRestApiIds(this: RxCollection, data: Record<string, any>[]) {
	// fetch all ids from local database
	const { docs } = await this.storageInstance.internals.pouch
		.find({
			selector: { id: { $exists: true } },
			// @ts-ignore
			fields: ['localID', 'id'],
		})
		.catch((err: any) => {
			console.log(err);
		});

	//
	if (docs.length > 0) {
		//
		const remove = map(docs, 'localID');

		forEach(docs, (doc) => {
			const intersection = find(data, { id: doc.id });
			if (intersection) {
				pull(remove, doc.localID);
				pull(data, intersection);
			}
		});

		await this.bulkRemove(remove).catch((err) => {
			console.log(err);
		});
	}

	return this.bulkInsert(data).catch((err) => {
		console.log(err);
	});
}
