const mockRuntime = { name: 'rxdb-storage' };
const mockCreateRuntime = jest.fn(() => mockRuntime);
const mockInstall = jest.fn();
const mockExpose = jest.fn().mockResolvedValue(() => Promise.resolve());
const mockRemote = { name: 'remote' };
const mockReceive = jest.fn();
const mockSchedule = jest.fn((runtime, task, ...args) => task(...args));

jest.mock('expo-file-system', () => ({ Paths: { document: { uri: 'file:///documents/' } } }));
jest.mock('react-native-worklets', () => ({
	createWorkletRuntime: mockCreateRuntime,
	scheduleOnRuntime: mockSchedule,
	scheduleOnRN: (task: (...args: unknown[]) => void, ...args: unknown[]) => task(...args),
}));
jest.mock(
	'@wcpos/react-native-worklet-fs',
	() => ({ installWorkletFs: mockInstall, getWorkletFs: () => ({}) }),
	{ virtual: true }
);
jest.mock(
	'@wcpos/rxdb-storage-worklet',
	() => ({
		getRxStorageWorklet: () => mockRemote,
		receiveWorkletMessage: mockReceive,
		exposeWorkletRxStorage: mockExpose,
	}),
	{ virtual: true }
);
jest.mock(
	'@wcpos/worklet-opfs',
	() => ({
		installWorkletRuntimePolyfills: jest.fn(),
		createWorkletOpfs: jest.fn(),
		createAbstractFilesystemAdapter: jest.fn(),
		createPromiseQueueLock: jest.fn(),
	}),
	{ virtual: true }
);
jest.mock('rxdb-premium/plugins/storage-abstract-filesystem', () => ({
	getRxStorageAbstractFilesystem: () => ({ name: 'engine' }),
}));
jest.mock('../../plugins/opfs-targeted-recovery.mjs', () => ({
	withTargetedOpfsRecovery: (storage: object) => ({ ...storage, recovered: true }),
}));

beforeEach(() => {
	jest.resetModules();
	jest.clearAllMocks();
	jest.useFakeTimers();
});
afterEach(() => jest.useRealTimers());

it.each(['file:///documents/', 'file:///documents', '/documents/'])(
	'derives a native root from %s',
	async (uri) => {
		const { workletRootDirectory } = await import('./worklet-host');
		expect(workletRootDirectory(uri)).toBe('/documents/.worklet-opfs');
	}
);

it('initializes one runtime, exposes recovery beside the engine, and passes the RN receiver', async () => {
	const { createWorkletStorage } = await import('./worklet-host');
	await expect(Promise.all([createWorkletStorage(), createWorkletStorage()])).resolves.toEqual([
		mockRemote,
		mockRemote,
	]);
	expect(mockCreateRuntime).toHaveBeenCalledTimes(1);
	expect(mockInstall).toHaveBeenCalledWith(mockRuntime);
	expect(mockSchedule).toHaveBeenCalledWith(
		mockRuntime,
		expect.any(Function),
		'/documents/.worklet-opfs',
		expect.any(Function),
		mockReceive
	);
	expect(mockExpose).toHaveBeenCalledWith(
		expect.objectContaining({
			storage: { name: 'engine', recovered: true },
			identifier: 'wcpos',
			receiveOnRN: mockReceive,
		})
	);
	expect(jest.getTimerCount()).toBe(0);
});

it.each(['native install', 'worker setup', 'async exposure', 'missing callback'])(
	'rejects rather than hanging after %s fails',
	async (failure) => {
		if (failure === 'native install')
			mockInstall.mockImplementationOnce(() => {
				throw new Error('native install failed');
			});
		if (failure === 'worker setup') {
			const { installWorkletRuntimePolyfills } = await import('@wcpos/worklet-opfs');
			jest.mocked(installWorkletRuntimePolyfills).mockImplementationOnce(() => {
				throw new Error('worker setup failed');
			});
		}
		if (failure === 'async exposure')
			mockExpose.mockRejectedValueOnce(new Error('async exposure failed'));
		if (failure === 'missing callback') mockSchedule.mockImplementationOnce(() => undefined);
		const { createWorkletStorage } = await import('./worklet-host');
		const result = expect(createWorkletStorage()).rejects.toThrow(
			/WCPOS worklet storage initialization failed/
		);
		if (failure === 'missing callback') await jest.advanceTimersByTimeAsync(10_000);
		await result;
		expect(jest.getTimerCount()).toBe(0);
	}
);

const mockFallbackInstance = { host: 'js-thread' };
const mockLogError = jest.fn();
jest.mock('@wcpos/utils/logger', () => ({ getLogger: () => ({ error: mockLogError }) }));
jest.mock('rxdb-premium/plugins/storage-filesystem-expo', () => ({
	getRxStorageExpoAsync: () => ({ createStorageInstance: async () => mockFallbackInstance }),
}));

it.each(['native install', 'missing callback'])(
	'opens via the real host selector when %s fails',
	async (failure) => {
		if (failure === 'native install')
			mockInstall.mockImplementationOnce(() => {
				throw new Error('native unavailable');
			});
		else mockSchedule.mockImplementationOnce(() => undefined);
		const { getNativeNewStorage } = await import('./index');
		const storage = getNativeNewStorage();
		const opened = storage.createStorageInstance({} as never);
		if (failure === 'missing callback') await jest.advanceTimersByTimeAsync(10_000);
		await expect(opened).resolves.toBe(mockFallbackInstance);
		expect(mockLogError).toHaveBeenCalledWith(
			expect.stringContaining('JS-thread'),
			expect.objectContaining({ code: 'SYNC171' })
		);
	}
);
