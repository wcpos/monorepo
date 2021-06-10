import forEach from 'lodash/forEach';
import map from 'lodash/map';
import get from 'lodash/get';

type RxCollection = import('rxdb').RxCollection;
type RxDocument = import('rxdb').RxDocument;

export async function bulkUpsertFromServer(this: RxCollection, data: Record<string, any>[]) {
	const collection = this;

	// loop through data and match ids to local database
	forEach(data, async (item) => {
		if (item.id) {
			const existing = (await collection.find().where('id').eq(item.id).exec()) as RxDocument[];
			const firstExisting = existing.shift();
			if (existing.length > 0) {
				console.warn('This should not happen, remove extraneous records');
				collection.bulkRemove(map(existing, '_id'));
			}
			if (firstExisting) {
				// check local modified time
				const d1 = new Date(get(firstExisting, 'dateModifiedGmt'));
				const d2 = new Date(get(item, 'dateModifiedGmt'));
				if (d1 > d2) {
					console.warn('Record has local updates, TODO: merge strategy');
				} else {
					// upsert item
					firstExisting.atomicPatch(item);
				}
			} else {
				// insert new item
				collection.insert(item);
			}
		}
	});
}
