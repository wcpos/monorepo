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
