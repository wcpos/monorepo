const events: string[] = [];

const mockPostCreate = jest.fn();
const mockAddCollections = jest.fn(async () => ({
	orders: {
		postCreate: mockPostCreate,
	},
}));
const mockCreateRxDatabase = jest.fn(async ({ name }: { name: string }) => ({
	name,
	addCollections: async () => {
		events.push(`add:${name}`);
		return mockAddCollections();
	},
}));
const mockVerifyStorageMigration = jest.fn(async ({ database }: { database: { name: string } }) => {
	events.push(`verify:${database.name}`);
});
const mockRunStorageMigration = jest.fn(async ({ database }: { database: { name: string } }) => {
	events.push(`migrate:${database.name}`);
});
const mockGetStorageMigrationConfig = jest.fn(() => ({
	oldStorage: { name: 'old-storage' },
	sourceStorage: 'source-storage',
	targetStorage: 'target-storage',
}));
const mockLogger = {
	error: jest.fn(),
};

jest.mock('rxdb', () => ({
	createRxDatabase: (args: { name: string }) => mockCreateRxDatabase(args),
}));

jest.mock('./adapters/default', () => ({
	defaultConfig: { storage: { name: 'default-storage' } },
}));

jest.mock('./adapters/fast', () => ({
	fastStorageConfig: { storage: { name: 'fast-storage' } },
}));

jest.mock('./adapters/ephemeral', () => ({
	ephemeralStorageConfig: { storage: { name: 'ephemeral-storage' } },
}));

jest.mock('./migration/storage', () => ({
	getStorageMigrationConfig: () => mockGetStorageMigrationConfig(),
}));

jest.mock('./migration/storage/run-storage-migration', () => ({
	runStorageMigration: (args: { database: { name: string } }) => mockRunStorageMigration(args),
}));

jest.mock('./migration/storage/verify-migration', () => ({
	verifyStorageMigration: (args: { database: { name: string } }) =>
		mockVerifyStorageMigration(args),
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
	});

	it.each([
		[
			'createUserDB',
			'wcposusers_v2',
			'wcposusers_v3',
			async (module: typeof import('./create-db')) => module.createUserDB(),
		],
		[
			'createStoreDB',
			'store_v2_abc123',
			'store_v3_abc123',
			async (module: typeof import('./create-db')) => module.createStoreDB('abc123'),
		],
		[
			'createFastStoreDB',
			'fast_store_v3_abc123',
			'fast_store_v4_abc123',
			async (module: typeof import('./create-db')) => module.createFastStoreDB('abc123'),
		],
	])(
		'runs deferred cleanup verification before migration for %s',
		async (_label, oldName, newName, factory) => {
			const module = await import('./create-db');

			const db = await factory(module);

			expect(db?.name).toBe(newName);
			expect(mockCreateRxDatabase).toHaveBeenCalledWith(
				expect.objectContaining({ name: newName, localDocuments: true })
			);
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
				})
			);
			expect(events).toEqual([`add:${newName}`, `verify:${newName}`, `migrate:${newName}`]);
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
});
