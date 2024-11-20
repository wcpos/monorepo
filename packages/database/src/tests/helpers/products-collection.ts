import { createRxDatabase, RxStorage, RxCollection, randomCouchString } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { productDefaultSchema, generateProduct } from './product-schemas';

export async function create(
	size: number = 20,
	collectionName: string = 'products',
	multiInstance: boolean = true,
	eventReduce: boolean = true,
	storage: RxStorage<any, any> = getRxStorageMemory()
): Promise<RxCollection<typeof productDefaultSchema, object, object>> {
	const db = await createRxDatabase<{ human: RxCollection<typeof productDefaultSchema> }>({
		name: randomCouchString(10),
		storage,
		multiInstance,
		eventReduce,
		ignoreDuplicate: true,
		localDocuments: true,
	});

	const collections = await db.addCollections({
		[collectionName]: {
			schema: productDefaultSchema,
			localDocuments: false,
		},
	});

	// insert data
	if (size > 0) {
		const docsData = new Array(size).fill(0).map(() => generateProduct());
		await collections[collectionName].bulkInsert(docsData);
	}
	return collections[collectionName];
}
