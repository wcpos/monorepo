import forEach from 'lodash/forEach';
import map from 'lodash/map';
import get from 'lodash/get';

type RxCollection = import('rxdb').RxCollection;
type RxDocument = import('rxdb').RxDocument;

export async function auditIdsFromServer(this: RxCollection, data: Record<string, any>[]) {
	const collection = this;

	// @ts-ignore
	const { docs } = await collection.pouch.find({ selector: {}, fields: ['_id', 'id'] });
	debugger;
	// no local docs
	if (docs.length === 0) {
		return collection.bulkInsert(data);
	}

	// get all localIds
	// compare to list from server
	// bulkinsert, bulkupsert or bulkdelete

	return null;
}
