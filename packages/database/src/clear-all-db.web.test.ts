const mockCloseDatabases = jest.fn(async () => undefined);
const mockTerminateWorker = jest.fn();
jest.mock('./plugins/rx-database-registry', () => ({
	closeRegisteredDatabases: mockCloseDatabases,
}));
jest.mock('./adapters/storage/index.web', () => ({ terminateStorageWorker: mockTerminateWorker }));

const cachedRequests = [
	{ url: 'https://example.com/image-1.jpg' },
	{ url: 'https://example.com/image-2.jpg' },
] as unknown as Request[];

const mockCacheDelete = jest.fn(async (_request: RequestInfo) => true);
const mockCacheKeys = jest.fn(async () => cachedRequests);
const mockCacheOpen = jest.fn(
	async () =>
		({
			delete: mockCacheDelete,
			keys: mockCacheKeys,
		}) as unknown as Cache
);

describe('clearAllDB web', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();
		Object.defineProperty(globalThis, 'indexedDB', {
			configurable: true,
			value: {
				databases: jest.fn(async () => []),
			},
		});
		Object.defineProperty(globalThis, 'navigator', {
			configurable: true,
			value: { storage: {} },
		});
		Object.defineProperty(globalThis, 'caches', {
			configurable: true,
			value: { open: mockCacheOpen },
		});
	});

	it('closes databases, releases the worker handles, then removes only app roots', async () => {
		const removeEntry = jest.fn(async () => {
			expect(mockCloseDatabases).toHaveBeenCalledTimes(1);
			expect(mockTerminateWorker).toHaveBeenCalledTimes(1);
		});
		const { SQLITE_POOL_DIRECTORY } = await import('./adapters/storage/sqlite-pool');
		Object.defineProperty(navigator, 'storage', {
			value: {
				getDirectory: async () => ({
					async *[Symbol.asyncIterator]() {
						for (const name of [SQLITE_POOL_DIRECTORY, 'rxdb-wcposusers_v6-sites-0', 'unrelated'])
							yield [name, {}];
					},
					removeEntry,
				}),
			},
		});
		const { clearAllDB } = await import('./clear-all-db.web');
		await expect(clearAllDB()).resolves.toMatchObject({ databasesDeleted: 2 });
		expect(removeEntry.mock.calls).toEqual([
			[SQLITE_POOL_DIRECTORY, { recursive: true }],
			['rxdb-wcposusers_v6-sites-0', { recursive: true }],
		]);
		expect(mockCloseDatabases.mock.invocationCallOrder[0]).toBeLessThan(
			mockTerminateWorker.mock.invocationCallOrder[0]
		);
	});

	it('does not terminate or delete if closing a database fails', async () => {
		mockCloseDatabases.mockRejectedValueOnce(new Error('close failed'));
		const { clearAllDB } = await import('./clear-all-db.web');
		await expect(clearAllDB()).rejects.toThrow('close failed');
		expect(mockTerminateWorker).not.toHaveBeenCalled();
	});

	it('deletes every cached image during local-data reset', async () => {
		const { clearAllDB } = await import('./clear-all-db.web');

		await clearAllDB();
		await new Promise<void>((resolve) => setImmediate(resolve));

		expect(mockCacheOpen).toHaveBeenCalledWith('wcpos-images-v1');
		expect(mockCacheKeys).toHaveBeenCalledTimes(1);
		expect(mockCacheDelete.mock.calls.map(([request]) => request)).toEqual(cachedRequests);
	});

	it('does not fail when the Cache API is unavailable', async () => {
		Object.defineProperty(globalThis, 'caches', { configurable: true, value: undefined });
		const { clearAllDB } = await import('./clear-all-db.web');

		await expect(clearAllDB()).resolves.toMatchObject({ success: true });
	});

	it('does not fail when opening the image cache throws', async () => {
		mockCacheOpen.mockImplementationOnce(() => {
			throw new Error('Cache API unavailable');
		});
		const { clearAllDB } = await import('./clear-all-db.web');

		await expect(clearAllDB()).resolves.toMatchObject({ success: true });
		expect(mockCacheOpen).toHaveBeenCalledWith('wcpos-images-v1');
	});
});
