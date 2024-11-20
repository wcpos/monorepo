import { faker } from '@faker-js/faker';
import { createRxDatabase, RxStorage, RxCollection, randomCouchString } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { v4 as uuidv4 } from 'uuid';

export const nestedDefaultSchema = {
	title: 'nested schema',
	version: 0,
	description: 'describes a nested document',
	keyCompression: false,
	primaryKey: 'uuid',
	type: 'object',
	properties: {
		uuid: {
			type: 'string',
			maxLength: 36,
		},
		name: {
			type: 'string',
		},
		child: {
			description: 'Nested children',
			type: 'array',
			ref: 'nested',
			items: {
				type: 'string',
			},
		},
	},
	indexes: [],
};

export const generateNested = (
	uuid: string = uuidv4(),
	name: string = faker.word.interjection()
) => {
	return {
		uuid,
		name,
	};
};

export async function create(
	size: number = 20,
	collectionName: string = 'nested',
	multiInstance: boolean = true,
	eventReduce: boolean = true,
	storage: RxStorage<any, any> = getRxStorageMemory()
): Promise<RxCollection<typeof nestedDefaultSchema, object, object>> {
	const db = await createRxDatabase<{ human: RxCollection<typeof nestedDefaultSchema> }>({
		name: randomCouchString(10),
		storage,
		multiInstance,
		eventReduce,
		ignoreDuplicate: true,
		localDocuments: true,
	});

	const collections = await db.addCollections({
		[collectionName]: {
			schema: nestedDefaultSchema,
			localDocuments: false,
		},
	});

	// insert data
	if (size > 0) {
		const docsData = new Array(size).fill(0).map(() => generateNested());
		await collections[collectionName].bulkInsert(docsData);
	}
	return collections[collectionName];
}
