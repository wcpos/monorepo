import { storeCollections, syncCollections, userCollections } from './collections';

const events: string[] = [];
const localMarkerQueues = new Map<string, any[]>();
const createdDatabases = new Map<string, any[]>();

const mockPostCreate = jest.fn();
const mockAddCollections = jest.fn(async () => ({
	orders: {
		postCreate: mockPostCreate,
	},
}));
const mockRemoveRxDatabase = jest.fn(
	async (name: string, _storage?: unknown, _multiInstance?: boolean) => {
		events.push(`remove:${name}`);
	}
);
const mockCreateRxDatabase = jest.fn(async ({ name }: { name: string }) => {
	const database = {
		name,
		getLocal: jest.fn(async () => {
			const queue = localMarkerQueues.get(name);
			return queue?.shift() ?? null;
		}),
		close: jest.fn(async () => {
			events.push(`close:${name}`);
		}),
		addCollections: jest.fn(async () => {
			events.push(`add:${name}`);
			return mockAddCollections();
		}),
	};

	const databasesForName = createdDatabases.get(name) ?? [];
	databasesForName.push(database);
	createdDatabases.set(name, databasesForName);

	return database;
});
const mockVerifyStorageMigration = jest.fn(async ({ database }: { database: { name: string } }) => {
	events.push(`verify:${database.name}`);
});
const mockPrepareOldDatabaseForStorageMigration = jest.fn(
	async ({ oldDatabaseName }: { oldDatabaseName: string }) => {
		events.push(`prepare:${oldDatabaseName}`);
	}
);
const mockRunStorageMigration = jest.fn(
	async ({
		database,
		prepareOldDatabase,
	}: {
		database: { name: string };
		prepareOldDatabase?: () => Promise<void>;
	}) => {
		events.push(`migrate:${database.name}:start`);
		await prepareOldDatabase?.();
		events.push(`migrate:${database.name}:end`);
	}
);
const mockGetStorageMigrationConfig = jest.fn((_databaseKind?: unknown) => ({
	oldStorage: { name: 'old-storage' },
	sourceStorage: 'source-storage',
	targetStorage: 'target-storage',
}));
const mockLogger = {
	error: jest.fn(),
};

jest.mock('rxdb', () => ({
	createRxDatabase: (args: { name: string }) => mockCreateRxDatabase(args),
	removeRxDatabase: (name: string, storage: unknown, multiInstance?: boolean) =>
		mockRemoveRxDatabase(name, storage, multiInstance),
}));

jest.mock('./adapters/default', () => ({
	defaultConfig: { storage: { name: 'default-storage' } },
}));

jest.mock('./adapters/fast', () => ({
	fastStorageConfig: { storage: { name: 'fast-storage' }, multiInstance: false },
}));

jest.mock('./adapters/ephemeral', () => ({
	ephemeralStorageConfig: { storage: { name: 'ephemeral-storage' } },
}));

jest.mock('./migration/storage', () => ({
	getStorageMigrationConfig: (databaseKind: unknown) => mockGetStorageMigrationConfig(databaseKind),
	prepareOldDatabaseForStorageMigration: (args: unknown) =>
		mockPrepareOldDatabaseForStorageMigration(args as { oldDatabaseName: string }),
}));

jest.mock('./migration/storage/run-storage-migration', () => ({
	runStorageMigration: (args: { database: { name: string } }) => mockRunStorageMigration(args),
}));

jest.mock('./migration/storage/verify-migration', () => ({
	verifyStorageMigration: (args: { database: { name: string } }) =>
		mockVerifyStorageMigration(args),
	getMigrationLocalDocId: (databaseName: string) => `storage-migration::${databaseName}`,
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => mockLogger,
}));

jest.mock('@wcpos/utils/logger/error-codes', () => ({
	ERROR_CODES: {
		CONNECTION_FAILED: 'CONNECTION_FAILED',
	},
}));

describe('create-db migration wiring', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		events.length = 0;
		localMarkerQueues.clear();
		createdDatabases.clear();
	});

	it.each([
		[
			'createUserDB',
			'wcposusers_v2',
			'wcposusers_v3',
			'user',
			async (module: typeof import('./create-db')) => module.createUserDB(),
		],
		[
			'createStoreDB',
			'store_v2_abc123',
			'store_v3_abc123',
			'store',
			async (module: typeof import('./create-db')) => module.createStoreDB('abc123'),
		],
		[
			'createFastStoreDB',
			'fast_store_v3_abc123',
			'fast_store_v4_abc123',
			'fast-store',
			async (module: typeof import('./create-db')) => module.createFastStoreDB('abc123'),
		],
	])(
		'runs deferred cleanup verification before migration for %s',
		async (_label, oldName, newName, migrationKind, factory) => {
			const module = await import('./create-db');
			const expectedCollections = oldName.startsWith('wcposusers_')
				? userCollections
				: oldName.startsWith('store_v2_')
					? storeCollections
					: syncCollections;

			const db = await factory(module);

			expect(db?.name).toBe(newName);
			expect(mockCreateRxDatabase).toHaveBeenCalledWith(
				expect.objectContaining({ name: newName, localDocuments: true })
			);
			expect(mockGetStorageMigrationConfig).toHaveBeenCalledWith(migrationKind);
			expect(mockVerifyStorageMigration).toHaveBeenCalledWith(
				expect.objectContaining({
					database: expect.objectContaining({ name: newName }),
					oldDatabaseName: oldName,
					sourceStorage: 'source-storage',
					targetStorage: 'target-storage',
				})
			);
			expect(mockRunStorageMigration).toHaveBeenCalledWith(
				expect.objectContaining({
					database: expect.objectContaining({ name: newName }),
					oldDatabaseName: oldName,
					oldStorage: { name: 'old-storage' },
					sourceStorage: 'source-storage',
					targetStorage: 'target-storage',
					prepareOldDatabase: expect.any(Function),
				})
			);
			expect(events).toEqual([
				`add:${newName}`,
				`verify:${newName}`,
				`migrate:${newName}:start`,
				`prepare:${oldName}`,
				`migrate:${newName}:end`,
			]);
			expect(mockPrepareOldDatabaseForStorageMigration).toHaveBeenCalledWith({
				oldDatabaseName: oldName,
				oldStorage: { name: 'old-storage' },
				collections: expectedCollections,
			});
		}
	);

	it('does not run storage migration for the temporary database', async () => {
		const module = await import('./create-db');

		const db = await module.createTemporaryDB();

		expect(db?.name).toBe('temporary');
		expect(mockPostCreate).toHaveBeenCalledWith(expect.any(Function));
		expect(mockLogger.error).not.toHaveBeenCalled();
		expect(mockVerifyStorageMigration).not.toHaveBeenCalled();
		expect(mockRunStorageMigration).not.toHaveBeenCalled();
	});

	it('recreates the fast-store target database before retrying a failed migration marker', async () => {
		localMarkerQueues.set('fast_store_v4_abc123', [{ data: { status: 'failed' } }, null]);

		const module = await import('./create-db');

		const db = await module.createFastStoreDB('abc123');
		const [firstDatabase, secondDatabase] = createdDatabases.get('fast_store_v4_abc123') ?? [];

		expect(db).toBe(secondDatabase);
		expect(firstDatabase?.close).toHaveBeenCalledTimes(1);
		expect(firstDatabase?.addCollections).not.toHaveBeenCalled();
		expect(mockRemoveRxDatabase).toHaveBeenCalledWith(
			'fast_store_v4_abc123',
			{ name: 'fast-storage' },
			false
		);
		expect(mockCreateRxDatabase).toHaveBeenCalledTimes(2);
		expect(mockCreateRxDatabase).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				name: 'fast_store_v4_abc123',
				allowSlowCount: true,
				localDocuments: true,
				closeDuplicates: true,
				multiInstance: false,
			})
		);
		expect(mockCreateRxDatabase).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				name: 'fast_store_v4_abc123',
				allowSlowCount: true,
				localDocuments: true,
				closeDuplicates: true,
				multiInstance: false,
			})
		);
		expect(secondDatabase?.addCollections).toHaveBeenCalledWith(syncCollections);
		expect(mockVerifyStorageMigration).toHaveBeenCalledWith(
			expect.objectContaining({
				database: secondDatabase,
				oldDatabaseName: 'fast_store_v3_abc123',
			})
		);
		expect(mockRunStorageMigration).toHaveBeenCalledWith(
			expect.objectContaining({
				database: secondDatabase,
				oldDatabaseName: 'fast_store_v3_abc123',
			})
		);
		expect(events).toEqual([
			'close:fast_store_v4_abc123',
			'remove:fast_store_v4_abc123',
			'add:fast_store_v4_abc123',
			'verify:fast_store_v4_abc123',
			'migrate:fast_store_v4_abc123:start',
			'prepare:fast_store_v3_abc123',
			'migrate:fast_store_v4_abc123:end',
		]);
	});
});
