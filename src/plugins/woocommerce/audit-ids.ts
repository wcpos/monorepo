import find from 'lodash/find';

type RxCollection = import('rxdb/dist/types').RxCollection;

/**
 * Match ids from server and local database
 * @TODO - works only on pouch internals, make general
 */
export async function auditRestApiIds(this: RxCollection, data: Record<string, any>[]) {
	// fetch all ids from local database
	// const { docs } = await this.storageInstance.internals.pouch
	const docs = await this.find({
		selector: { id: { $exists: true } },
		// fields: ['id'],
	})
		.exec()
		.catch((err: any) => {
			console.log(err);
		});

	// compare local and server ids
	const add = data.filter((d) => !find(docs, { id: d.id })).map((d) => ({ ...d, _deleted: false }));

	const remove = docs
		.filter((d) => !find(data, { id: d.id }))
		.map((d) => ({ ...d, _deleted: true }));

	// return changes to replication plugin
	return add.concat(remove);
}
