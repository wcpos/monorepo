import { createRxDatabase, RxCollection, RxStorage } from 'rxdb';
import { randomToken } from 'rxdb/plugins/utils';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

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
} as const;

export const generateNested = (
	uuid: string = randomToken(36),
	name: string = `nested-${randomToken(6)}`
) => {
	return {
		uuid,
		name,
	};
};

/**
 * Generate a unique database name
 */
function generateUniqueDbName(baseName: string): string {
	return `${baseName}_${Date.now()}`;
}

export async function create(
	size: number = 20,
	collectionName: string = 'nested',
	storage: RxStorage<any, any> = getRxStorageMemory()
): Promise<RxCollection<any, object, object>> {
	const db = await createRxDatabase({
		name: generateUniqueDbName('nesteddb'),
		storage,
		allowSlowCount: true,
	});

	const collections = await db.addCollections({
		[collectionName]: {
			schema: nestedDefaultSchema,
		},
	});

	// insert data
	if (size > 0) {
		const docsData = new Array(size).fill(0).map(() => generateNested());
		await collections[collectionName].bulkInsert(docsData);
	}
	return collections[collectionName];
}
