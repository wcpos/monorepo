const mockCloseAsync = jest.fn();
const mockGetAllAsync = jest.fn();
const mockExecAsync = jest.fn();
const mockOpenDatabaseAsync = jest.fn(async (_name: string, _options?: unknown) => ({
	closeAsync: mockCloseAsync,
	getAllAsync: mockGetAllAsync,
	execAsync: mockExecAsync,
	runAsync: jest.fn(),
}));
const mockDeleteDatabaseAsync = jest.fn();
const mockGetRxStorageSQLite = jest.fn(
	(config: { sqliteBasics: { open(name: string): Promise<unknown> } }) => ({
		name: 'sqlite-storage',
		config,
	})
);
const mockLogger = {
	debug: jest.fn(),
	info: jest.fn(),
	error: jest.fn(),
};

class MockDirectory {
	name: string;
	uri: string;
	exists = false;

	constructor(...parts: ({ uri?: string } | string)[]) {
		this.uri = parts
			.map((part) => (typeof part === 'string' ? part : (part.uri ?? '')))
			.filter(Boolean)
			.join('/');
		this.name = String(parts[parts.length - 1] ?? '');
	}

	list() {
		return [];
	}

	delete() {}
}

jest.mock('expo-sqlite', () => ({
	openDatabaseAsync: (name: string, options?: unknown) => mockOpenDatabaseAsync(name, options),
	deleteDatabaseAsync: (name: string) => mockDeleteDatabaseAsync(name),
	defaultDatabaseDirectory: 'sqlite-dir',
}));

jest.mock('expo-file-system', () => ({
	Directory: MockDirectory,
	Paths: {
		document: { uri: 'document-dir' },
	},
}));

jest.mock('rxdb-premium/plugins/storage-sqlite', () => ({
	getRxStorageSQLite: (config: { sqliteBasics: { open(name: string): Promise<unknown> } }) =>
		mockGetRxStorageSQLite(config),
}));

jest.mock('rxdb-premium-old/plugins/storage-sqlite', () => ({
	getRxStorageSQLite: (config: { sqliteBasics: { open(name: string): Promise<unknown> } }) =>
		mockGetRxStorageSQLite(config),
}));

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => mockLogger,
}));

jest.mock('@wcpos/utils/logger/error-codes', () => ({
	ERROR_CODES: {
		TRANSACTION_FAILED: 'TRANSACTION_FAILED',
	},
}));

describe('native storage migration configuration', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();
	});

	it('returns expo-sqlite as the target native storage kind', async () => {
		const { getNativeStorageKind } = await import('./index');

		expect(getNativeStorageKind()).toBe('expo-sqlite');
	});

	it('closes cached legacy sqlite connections before cleanup', async () => {
		const { getNativeOldStorage, closeAllLegacyNativeDatabases } = await import('./index');

		getNativeOldStorage();
		const sqliteStorageArgs = mockGetRxStorageSQLite.mock.calls[0]?.[0] as
			| { sqliteBasics: { open(name: string): Promise<unknown> } }
			| undefined;

		expect(sqliteStorageArgs).toBeDefined();
		await sqliteStorageArgs!.sqliteBasics.open('wcposusers_v2');

		await closeAllLegacyNativeDatabases();

		expect(mockCloseAsync).toHaveBeenCalledTimes(1);
	});

	it('rethrows real sqlite deletion failures during clear-all-db', async () => {
		mockDeleteDatabaseAsync.mockRejectedValueOnce(new Error('disk I/O error'));
		const { clearAllDB } = await import('../../clear-all-db');

		await expect(clearAllDB()).rejects.toThrow('disk I/O error');
	});
});
