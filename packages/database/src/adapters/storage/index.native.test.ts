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

jest.mock(
	'rxdb-premium/plugins/storage-sqlite',
	() => ({
		getRxStorageSQLite: (config: { sqliteBasics: { open(name: string): Promise<unknown> } }) =>
			mockGetRxStorageSQLite(config),
	}),
	{ virtual: true }
);

jest.mock('@wcpos/utils/logger', () => ({
	getLogger: () => mockLogger,
}));

jest.mock('@wcpos/utils/logger/error-codes', () => ({
	ERROR_CODES: {
		TRANSACTION_FAILED: 'TRANSACTION_FAILED',
	},
}));

describe('native storage', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();
	});

	it('creates the expo-sqlite storage with the shared database cache', async () => {
		const { getNativeNewStorage } = await import('./index');

		expect(getNativeNewStorage()).toEqual({
			name: 'sqlite-storage',
			config: {
				sqliteBasics: expect.objectContaining({
					open: expect.any(Function),
				}),
			},
		});
	});

	it('closes cached sqlite connections before cleanup', async () => {
		const { closeAllCachedNativeDatabases, getSQLiteBasicsExpoSQLiteAsync } =
			await import('./index');

		await getSQLiteBasicsExpoSQLiteAsync().open('wcposusers_v4');
		await closeAllCachedNativeDatabases();

		expect(mockCloseAsync).toHaveBeenCalledTimes(1);
	});

	it('rethrows real sqlite deletion failures during clear-all-db', async () => {
		mockDeleteDatabaseAsync.mockRejectedValueOnce(new Error('disk I/O error'));
		const { clearAllDB } = await import('../../clear-all-db');

		await expect(clearAllDB()).rejects.toThrow('disk I/O error');
	});
});
