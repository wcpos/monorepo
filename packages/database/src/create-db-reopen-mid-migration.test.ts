import type { RxCollection, RxDatabase, RxJsonSchema } from 'rxdb';
import type { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

type Item = { id: string; value: number };
type Deferred = { promise: Promise<void>; resolve: () => void };

jest.mock('@wcpos/utils/logger', () => {
	const mockLogger = { error: jest.fn(), info: jest.fn() };
	return { getLogger: () => mockLogger, __logger: mockLogger };
});

jest.mock('./adapters/default', () => {
	const { getRxStorageMemory } = require('rxdb/plugins/storage-memory');
	const storage = getRxStorageMemory();
	const config = { storage, multiInstance: false };
	return { defaultConfig: config, __storage: storage, __config: config };
});

jest.mock('./collections', () => {
	const deferred = (): Deferred => {
		let resolve!: () => void;
		const promise = new Promise<void>((done) => {
			resolve = done;
		});
		return { promise, resolve };
	};
	const startedFirst = deferred();
	const startedSecond = deferred();
	const gate = deferred();
	const databases = new Set<RxDatabase>();
	const schema: RxJsonSchema<Item> = {
		version: 1,
		primaryKey: 'id',
		type: 'object',
		properties: { id: { type: 'string', maxLength: 20 }, value: { type: 'number' } },
		required: ['id', 'value'],
	};
	return {
		...jest.requireActual('./collections'),
		__startedFirst: startedFirst,
		__startedSecond: startedSecond,
		__gate: gate,
		__databases: databases,
		storeCollections: {
			items: {
				schema,
				migrationStrategies: {
					1: async (doc: Item, collection: RxCollection<Item>) => {
						databases.add(collection.database);
						if (databases.size === 1) startedFirst.resolve();
						if (databases.size === 2) startedSecond.resolve();
						await gate.promise;
						return doc;
					},
				},
			},
		},
	};
});

async function settleFirst<T>(first: Promise<T>): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error('first createStoreDB never settled')), 3000);
	});
	try {
		return await Promise.race([first, timeout]);
	} finally {
		clearTimeout(timer);
	}
}

describe.each([false, true])('multiInstance %s', (multiInstance) => {
	let second: ReturnType<typeof import('./create-db').createStoreDB> | undefined;
	let gate: Deferred;

	beforeEach(() => {
		jest.resetModules();
		second = undefined;
	});

	afterEach(async () => {
		gate.resolve();
		await (await second)?.close();
	});

	it('settles the superseded open and migrates all documents in the second open', async () => {
		const { __storage: storage, __config: config } = jest.requireMock<{
			__storage: ReturnType<typeof getRxStorageMemory>;
			__config: { multiInstance: boolean };
		}>('./adapters/default');
		config.multiInstance = multiInstance;
		const {
			__startedFirst: startedFirst,
			__startedSecond: startedSecond,
			__gate,
			__databases: databases,
			storeCollections,
		} = jest.requireMock<{
			__startedFirst: Deferred;
			__startedSecond: Deferred;
			__gate: Deferred;
			__databases: Set<RxDatabase>;
			storeCollections: { items: { schema: RxJsonSchema<Item> } };
		}>('./collections');
		gate = __gate;
		const { __logger: mockLogger } = jest.requireMock<{
			__logger: { error: jest.Mock; info: jest.Mock };
		}>('@wcpos/utils/logger');
		const { addRxPlugin, createRxDatabase } = await import('rxdb');
		const { RxDBMigrationSchemaPlugin } = await import('rxdb/plugins/migration-schema');
		addRxPlugin(RxDBMigrationSchemaPlugin);
		const { createStoreDB } = await import('./create-db');
		const { getStoreDatabaseName } = await import('./database-names');
		const id = `reopen${multiInstance}`;
		const seed = await createRxDatabase({ name: getStoreDatabaseName(id), storage });
		const { items } = await seed.addCollections({
			items: { schema: { ...storeCollections.items.schema, version: 0 } },
		});
		for (let value = 0; value < 3; value++) {
			await items.insert({ id: String(value), value });
		}
		await seed.close();

		const first = createStoreDB(id);
		await startedFirst.promise;
		second = createStoreDB(id);
		await startedSecond.promise;
		expect(databases.values().next().value?.closed).toBe(true);
		gate.resolve();

		const firstResult = await settleFirst(first);
		process.stdout.write(
			`first createStoreDB resolved to ${firstResult ? 'a database' : 'undefined'}\n`
		);
		const db = (await second) as unknown as RxDatabase<{ items: RxCollection<Item> }>;
		expect(db).toBeDefined();
		expect(db.items.schema.version).toBe(1);
		expect(await db.items.count().exec()).toBe(3);
		expect(mockLogger.error).not.toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ showToast: true })
		);
	});
});
