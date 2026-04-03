const mockInvoke = jest.fn();
const mockIpcRenderer = {
	invoke: mockInvoke,
};
const mockGetRxStorageIpcRenderer = jest.fn((args: unknown) => ({
	kind: 'ipc-renderer-storage',
	args,
}));
const mockGetRxStorageSQLite = jest.fn((args: unknown) => ({
	kind: 'sqlite-storage',
	args,
}));

jest.mock('rxdb/plugins/electron', () => ({
	getRxStorageIpcRenderer: (args: unknown) => mockGetRxStorageIpcRenderer(args),
}));

jest.mock('rxdb-premium-old/plugins/storage-sqlite', () => ({
	getRxStorageSQLite: (args: unknown) => mockGetRxStorageSQLite(args),
}));

describe('electron storage migration helpers', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(globalThis as any).window = {
			ipcRenderer: mockIpcRenderer,
		};
	});

	afterEach(() => {
		delete (globalThis as any).window;
	});

	it('exposes the electron migration labels and storage split', async () => {
		const { getElectronNewStorage, getStorageMigrationConfig } = await import('./index.electron');

		expect(getStorageMigrationConfig()).toEqual({
			oldStorage: {
				kind: 'sqlite-storage',
				args: {
					sqliteBasics: expect.any(Object),
				},
			},
			sourceStorage: 'sqlite-ipc',
			targetStorage: 'filesystem-node-ipc',
		});

		expect(getElectronNewStorage()).toEqual({
			kind: 'ipc-renderer-storage',
			args: {
				key: 'main-storage',
				mode: 'storage',
				ipcRenderer: mockIpcRenderer,
			},
		});
	});

	it('deletes the old electron sqlite database over ipc', async () => {
		const { cleanupOldElectronDatabase } = await import('./cleanup.electron');

		await cleanupOldElectronDatabase('store_v2_abc123');

		expect(mockInvoke).toHaveBeenCalledWith('sqlite', {
			type: 'delete',
			name: 'store_v2_abc123',
		});
	});
});
