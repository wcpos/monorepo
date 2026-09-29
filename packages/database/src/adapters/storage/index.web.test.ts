const mockCreateInstance = jest.fn(async () => ({ close: jest.fn() }));
const mockGetRxStorageWorker = jest.fn((args) => {
	args.workerInput();
	return { name: 'worker', rxdbVersion: 'test', createStorageInstance: mockCreateInstance };
});
jest.mock(
	'rxdb-premium/plugins/storage-worker',
	() => ({
		getRxStorageWorker: (args: unknown) => mockGetRxStorageWorker(args),
	}),
	{ virtual: true }
);

class FakeWorker extends EventTarget {
	terminate = jest.fn();
}
const mockWorker = jest.fn(() => new FakeWorker());

describe('web SQLite storage', () => {
	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
		Object.defineProperty(globalThis, 'Worker', { configurable: true, value: mockWorker });
		delete (globalThis as { opfsWorker?: string }).opfsWorker;
	});

	it('uses the SQLite path and retains cache-busted overrides but refuses the old engine', async () => {
		const { getWebStorageWorkerPaths } = await import('./index.web');
		expect(getWebStorageWorkerPaths().targetOpfsWorker).toBe('/sqlite.worker.js');
		const runtime = globalThis as { opfsWorker?: string };
		runtime.opfsWorker = 'https://cdn.example/sqlite.worker.js?ver=abc';
		expect(getWebStorageWorkerPaths().targetOpfsWorker).toBe(runtime.opfsWorker);
		const error = jest.spyOn(console, 'error').mockImplementation(() => {});
		runtime.opfsWorker = '/opfs.worker.js';
		expect(getWebStorageWorkerPaths().targetOpfsWorker).toBe('/sqlite.worker.js');
		expect(error).toHaveBeenCalledTimes(1);
		error.mockRestore();
	});

	it('imports and reads metadata without a worker, then reuses one worker across opens', async () => {
		const { storage } = await import('../default/index.web');
		expect(storage.name).toMatch(/^error-handler-/);
		expect(storage.rxdbVersion).toBeDefined();
		expect(mockWorker).not.toHaveBeenCalled();
		const { getWebNewStorage } = await import('./index.web');
		const raw = getWebNewStorage();
		await raw.createStorageInstance({} as never);
		await raw.createStorageInstance({} as never);
		expect(mockWorker).toHaveBeenCalledTimes(1);
		expect(mockGetRxStorageWorker).toHaveBeenCalledWith({
			workerInput: expect.any(Function),
			mode: 'one',
			workerOptions: { type: 'module', name: 'wcpos-sqlite' },
		});
		expect(mockWorker).toHaveBeenCalledWith('/sqlite.worker.js', {
			type: 'module',
			name: 'wcpos-sqlite',
		});
	});

	it.each(['error', 'messageerror'])(
		'reports %s before an instance exists and allows unsubscribe',
		async (type) => {
			const { getWebNewStorage, onStorageWorkerLost, terminateStorageWorker } =
				await import('./index.web');
			const { isStorageDegraded, clearStorageDegradation } =
				await import('../../plugins/wrapped-error-handler-storage');
			await import('../default/index.web');
			clearStorageDegradation();
			const lost = jest.fn();
			const unsubscribe = onStorageWorkerLost(lost);
			await getWebNewStorage().createStorageInstance({} as never);
			const worker = mockWorker.mock.results[0].value;
			worker.dispatchEvent(new Event(type));
			expect(lost).toHaveBeenCalledWith(expect.stringContaining(type));
			expect(isStorageDegraded()).toBe(true);
			unsubscribe();
			worker.dispatchEvent(new Event(type));
			expect(lost).toHaveBeenCalledTimes(1);
			terminateStorageWorker();
			terminateStorageWorker();
			expect(worker.terminate).toHaveBeenCalledTimes(1);
			clearStorageDegradation();
		}
	);
});

it('retirement prevents late hydration opening a worker even when no worker existed', async () => {
	jest.resetModules();
	jest.clearAllMocks();
	const { getWebNewStorage, terminateStorageWorker } = await import('./index.web');
	terminateStorageWorker();
	await expect(getWebNewStorage().createStorageInstance({} as never)).rejects.toThrow('retired');
	expect(mockWorker).not.toHaveBeenCalled();
});
