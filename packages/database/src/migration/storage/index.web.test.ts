const mockGetRxStorageWorker = jest.fn((args) => ({
	client: 'new-worker-client',
	args,
}));
const mockGetRxStorageRemote = jest.fn<any, [unknown]>((args) => ({
	client: 'old-remote-client',
	args,
}));
const mockPrepareOldDatabaseForStorageMigration = jest.fn();

jest.mock('rxdb-premium/plugins/storage-worker', () => ({
	getRxStorageWorker: (args: unknown) => mockGetRxStorageWorker(args),
}));

jest.mock('rxdb-old/plugins/storage-remote', () => ({
	getRxStorageRemote: (args: unknown) => mockGetRxStorageRemote(args),
}));

jest.mock('./prepare-old-database', () => ({
	prepareOldDatabaseForStorageMigration: (args: unknown) =>
		mockPrepareOldDatabaseForStorageMigration(args),
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

	it('normalizes legacy remote attachment reads to Blob instances', async () => {
		mockGetRxStorageRemote.mockReturnValueOnce({
			createStorageInstance: jest.fn(async () => ({
				getAttachmentData: jest.fn(async () => Buffer.from('hello world').toString('base64')),
			})),
		} as any);

		const { getWebOldStorage } = await loadModule();
		const storage = getWebOldStorage();
		const instance = (await storage.createStorageInstance({} as never)) as unknown as {
			getAttachmentData: (
				documentId: string,
				attachmentId: string,
				digest: string
			) => Promise<Blob>;
		};
		const attachment = await instance.getAttachmentData('doc-1', 'attachment-1', 'digest-1');

		expect(attachment).toBeInstanceOf(Blob);
		expect(await attachment.text()).toBe('hello world');
	});

	it('re-exports old-database preparation for legacy web migrations', async () => {
		const { prepareOldDatabaseForStorageMigration } = await loadModule();
		const args = {
			oldDatabaseName: 'wcposusers_v2',
			oldStorage: { name: 'old-storage' },
			collections: { stores: { schema: { version: 6 } } },
		};

		await prepareOldDatabaseForStorageMigration(args as never);

		expect(mockPrepareOldDatabaseForStorageMigration).toHaveBeenCalledWith(args);
	});
});
