const mockAddCollections = jest.fn(async () => undefined);
const mockClose = jest.fn(async () => undefined);
const mockCreateRxDatabase = jest.fn(async (args: { name: string; storage: unknown }) => ({
	...args,
	addCollections: mockAddCollections,
	close: mockClose,
}));
const mockAddRxPlugin = jest.fn();

jest.mock('rxdb-old', () => ({
	addRxPlugin: (plugin: unknown) => mockAddRxPlugin(plugin),
	createRxDatabase: (args: unknown) =>
		mockCreateRxDatabase(args as { name: string; storage: unknown }),
}));

jest.mock('rxdb-old/plugins/attachments', () => ({
	RxDBAttachmentsPlugin: { name: 'attachments-plugin', rxdb: true },
}));

jest.mock('rxdb-old/plugins/migration-schema', () => ({
	RxDBMigrationPlugin: { name: 'migration-schema', rxdb: true },
}));

describe('prepareOldDatabaseForStorageMigration', () => {
	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
	});

	it('opens the old database with the provided collections and closes it', async () => {
		const { prepareOldDatabaseForStorageMigration } = await import('./prepare-old-database');

		await prepareOldDatabaseForStorageMigration({
			oldDatabaseName: 'store_v2_abc123',
			oldStorage: { kind: 'old-storage' },
			collections: { stores: { schema: { version: 1 } } },
		});

		expect(mockAddRxPlugin).toHaveBeenCalledTimes(2);
		expect(mockAddRxPlugin).toHaveBeenNthCalledWith(1, {
			name: 'migration-schema',
			rxdb: true,
		});
		expect(mockAddRxPlugin).toHaveBeenNthCalledWith(2, {
			name: 'attachments-plugin',
			rxdb: true,
		});
		expect(mockCreateRxDatabase).toHaveBeenCalledWith({
			name: 'store_v2_abc123',
			storage: { kind: 'old-storage' },
			multiInstance: false,
		});
		expect(mockAddCollections).toHaveBeenCalledWith({ stores: { schema: { version: 1 } } });
		expect(mockClose).toHaveBeenCalledTimes(1);
	});

	it('registers the old plugins only once across repeated preparations', async () => {
		const { prepareOldDatabaseForStorageMigration } = await import('./prepare-old-database');

		await prepareOldDatabaseForStorageMigration({
			oldDatabaseName: 'store_v2_abc123',
			oldStorage: { kind: 'old-storage' },
			collections: { stores: { schema: { version: 1 } } },
		});
		await prepareOldDatabaseForStorageMigration({
			oldDatabaseName: 'store_v2_def456',
			oldStorage: { kind: 'old-storage' },
			collections: { stores: { schema: { version: 1 } } },
		});

		expect(mockAddRxPlugin).toHaveBeenCalledTimes(2);
		expect(mockCreateRxDatabase).toHaveBeenCalledTimes(2);
		expect(mockClose).toHaveBeenCalledTimes(2);
	});
});
