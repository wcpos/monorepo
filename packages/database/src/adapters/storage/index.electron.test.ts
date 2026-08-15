const mockIpcRenderer = {
	invoke: jest.fn(),
};
const mockGetRxStorageIpcRenderer = jest.fn((args: unknown) => ({
	kind: 'ipc-renderer-storage',
	args,
}));

jest.mock('rxdb/plugins/electron', () => ({
	getRxStorageIpcRenderer: (args: unknown) => mockGetRxStorageIpcRenderer(args),
}));

describe('electron storage', () => {
	const runtime = globalThis as typeof globalThis & { window?: unknown };

	beforeEach(() => {
		jest.clearAllMocks();
		runtime.window = {
			ipcRenderer: mockIpcRenderer,
		};
	});

	afterEach(() => {
		delete runtime.window;
	});

	it('creates the IPC renderer storage', async () => {
		const { getElectronNewStorage } = await import('./index.electron');

		expect(getElectronNewStorage()).toEqual({
			kind: 'ipc-renderer-storage',
			args: {
				key: 'main-storage',
				mode: 'storage',
				ipcRenderer: mockIpcRenderer,
			},
		});
	});
});
