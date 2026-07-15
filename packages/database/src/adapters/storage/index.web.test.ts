const mockGetRxStorageWorker = jest.fn((args) => ({
	client: 'worker-client',
	args,
}));

jest.mock(
	'rxdb-premium/plugins/storage-worker',
	() => ({
		getRxStorageWorker: (args: unknown) => mockGetRxStorageWorker(args),
	}),
	{ virtual: true }
);

describe('web storage', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('exposes only the OPFS worker path', async () => {
		const { getWebStorageWorkerPaths } = await import('./index.web');

		expect(getWebStorageWorkerPaths()).toEqual({
			targetOpfsWorker: '/opfs.worker.js',
		});
	});

	it('creates the storage client with the OPFS worker', async () => {
		const { getWebNewStorage } = await import('./index.web');

		expect(getWebNewStorage()).toEqual({
			client: 'worker-client',
			args: {
				workerInput: '/opfs.worker.js',
			},
		});
	});
});
