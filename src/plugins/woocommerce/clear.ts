type RxCollection = import('rxdb/dist/types').RxCollection;

/**
 * Match ids from server and local database
 * @TODO - works only on pouch internals, make general
 */
export async function clear(this: RxCollection) {
	const docs = await this.find({
		selector: { id: { $exists: true } },
		// fields: ['id'],
	})
		.exec()
		.catch((err: any) => {
			console.log(err);
		});

	//
	return this.bulkRemove(docs.map((doc) => doc._id));
}
