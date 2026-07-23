const mockDeleteDirectory = jest.fn();
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

	constructor(...parts: ({ uri?: string } | string)[]) {
		this.uri = parts
			.map((part) => (typeof part === 'string' ? part : (part.uri ?? '')))
			.filter(Boolean)
			.join('/');
		this.name = String(parts[parts.length - 1] ?? '');
	}

	get exists() {
		return this.uri.endsWith('/SQLite');
	}

	list() {
		if (this.uri.endsWith('/SQLite')) {
			return [{ name: 'wcposusers_v6' }];
		}

		return [];
	}

	delete() {
		mockDeleteDirectory(this.uri);
	}
}

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

	it('removes the legacy SQLite directory during clear-all-db', async () => {
		const { clearAllDB } = await import('../../clear-all-db');

		await expect(clearAllDB()).resolves.toMatchObject({ databasesDeleted: 1 });
		expect(mockDeleteDirectory).toHaveBeenCalledWith('document-dir/SQLite');
	});
});
