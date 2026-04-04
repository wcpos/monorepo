const mockInvoke = jest.fn();
const mockIpcRenderer = {
	invoke: mockInvoke,
};
const mockGetRxStorageIpcRenderer = jest.fn((args: unknown) => ({
	kind: 'ipc-renderer-storage',
	args,
}));
const mockGetMemoryMappedRxStorage = jest.fn((args: unknown) => ({
	kind: 'memory-mapped-storage',
	args,
}));
const mockGetRxStorageSQLite = jest.fn((args: unknown) => ({
	kind: 'sqlite-storage',
	args,
}));

jest.mock('rxdb/plugins/electron', () => ({
	getRxStorageIpcRenderer: (args: unknown) => mockGetRxStorageIpcRenderer(args),
}));

jest.mock('rxdb-premium/plugins/storage-memory-mapped', () => ({
	getMemoryMappedRxStorage: (args: unknown) => mockGetMemoryMappedRxStorage(args),
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

		expect(getStorageMigrationConfig('user')).toEqual({
			oldStorage: expect.objectContaining({
				kind: 'sqlite-storage',
				createStorageInstance: expect.any(Function),
				args: {
					sqliteBasics: expect.any(Object),
				},
			}),
			sourceStorage: 'sqlite-ipc',
			targetStorage: 'filesystem-node-ipc',
		});
		expect(getStorageMigrationConfig('store')).toEqual({
			oldStorage: expect.objectContaining({
				kind: 'sqlite-storage',
				createStorageInstance: expect.any(Function),
				args: {
					sqliteBasics: expect.any(Object),
				},
			}),
			sourceStorage: 'sqlite-ipc',
			targetStorage: 'filesystem-node-ipc',
		});
		expect(getStorageMigrationConfig('fast-store')).toEqual({
			oldStorage: {
				kind: 'memory-mapped-storage',
				args: {
					storage: expect.objectContaining({
						kind: 'sqlite-storage',
						createStorageInstance: expect.any(Function),
						args: {
							sqliteBasics: expect.any(Object),
						},
					}),
				},
			},
			sourceStorage: 'sqlite-ipc',
			targetStorage: 'filesystem-node-ipc',
		});
		expect(mockGetMemoryMappedRxStorage).toHaveBeenCalledWith({
			storage: expect.objectContaining({
				kind: 'sqlite-storage',
				createStorageInstance: expect.any(Function),
				args: {
					sqliteBasics: expect.any(Object),
				},
			}),
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
