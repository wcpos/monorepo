const mockDeleteDatabaseAsync = jest.fn();
const mockGetRxStorageExpoAsync = jest.fn(() => ({ name: 'expo-filesystem-storage' }));
const mockWithTargetedOpfsRecovery = jest.fn((storage: unknown) => ({
	name: 'targeted-recovery-storage',
	storage,
}));
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
	deleteDatabaseAsync: (name: string) => mockDeleteDatabaseAsync(name),
	defaultDatabaseDirectory: 'sqlite-dir',
}));

jest.mock('expo-file-system', () => ({
	Directory: MockDirectory,
	Paths: {
		document: { uri: 'document-dir' },
	},
}));

jest.mock('rxdb-premium/plugins/storage-filesystem-expo', () => ({
	getRxStorageExpoAsync: () => mockGetRxStorageExpoAsync(),
}));

jest.mock('../../plugins/opfs-targeted-recovery.mjs', () => ({
	withTargetedOpfsRecovery: (storage: unknown) => mockWithTargetedOpfsRecovery(storage),
}));

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

	it('wraps the async Expo filesystem storage with targeted recovery', async () => {
		const { getNativeNewStorage } = await import('./index');

		expect(getNativeNewStorage()).toEqual({
			name: 'targeted-recovery-storage',
			storage: { name: 'expo-filesystem-storage' },
		});
		expect(mockGetRxStorageExpoAsync).toHaveBeenCalledTimes(1);
		expect(mockWithTargetedOpfsRecovery).toHaveBeenCalledWith({
			name: 'expo-filesystem-storage',
		});
	});

	it('rethrows real sqlite deletion failures during clear-all-db', async () => {
		mockDeleteDatabaseAsync.mockRejectedValueOnce(new Error('disk I/O error'));
		const { clearAllDB } = await import('../../clear-all-db');

		await expect(clearAllDB()).rejects.toThrow('disk I/O error');
	});
});
