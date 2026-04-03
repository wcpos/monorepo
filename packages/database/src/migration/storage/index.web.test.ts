const mockGetRxStorageWorker = jest.fn((args) => ({
	client: 'new-worker-client',
	args,
}));
const mockGetRxStorageRemote = jest.fn((args) => ({
	client: 'old-remote-client',
	args,
}));

jest.mock('rxdb-premium/plugins/storage-worker', () => ({
	getRxStorageWorker: (args: unknown) => mockGetRxStorageWorker(args),
}));

jest.mock('rxdb-old/plugins/storage-remote', () => ({
	getRxStorageRemote: (args: unknown) => mockGetRxStorageRemote(args),
}));

async function loadModule() {
	return import('./index.web');
}

describe('web storage worker paths', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('keeps both worker assets available during migration', async () => {
		const { getWebStorageWorkerPaths } = await loadModule();

		expect(getWebStorageWorkerPaths()).toEqual({
			legacyIndexedDbWorker: '/indexeddb.worker.js',
			targetOpfsWorker: '/opfs.worker.js',
		});
	});

	it('uses separate old/new storage clients for the legacy and target workers', async () => {
		const { getWebNewStorage, getWebOldStorage } = await loadModule();
		const oldStorage = getWebOldStorage();
		const newStorage = getWebNewStorage();

		expect(oldStorage).toEqual({
			client: 'old-remote-client',
			args: expect.objectContaining({
				identifier: 'rx-storage-worker-/indexeddb.worker.js',
				mode: undefined,
				messageChannelCreator: expect.any(Function),
			}),
		});
		expect(newStorage).toEqual({
			client: 'new-worker-client',
			args: {
				workerInput: '/opfs.worker.js',
			},
		});
		expect(mockGetRxStorageRemote).toHaveBeenCalledTimes(1);
		expect(mockGetRxStorageWorker).toHaveBeenCalledTimes(1);
		expect(mockGetRxStorageWorker).not.toHaveBeenCalledWith(
			expect.objectContaining({ workerInput: '/indexeddb.worker.js' })
		);
	});
});
