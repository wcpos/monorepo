const mockExpoInstance = { host: 'js-thread' };
const mockWorkletInstance = { host: 'worklet' };
const mockExpo = jest.fn(() => ({
	createStorageInstance: jest.fn().mockResolvedValue(mockExpoInstance),
}));
const mockWorklet = jest.fn(async () => ({
	createStorageInstance: jest.fn().mockResolvedValue(mockWorkletInstance),
}));
const mockError = jest.fn();

jest.mock('rxdb-premium/plugins/storage-filesystem-expo', () => ({
	getRxStorageExpoAsync: mockExpo,
}));
jest.mock('./worklet-host', () => ({ createWorkletStorage: mockWorklet }));
jest.mock('../../plugins/opfs-targeted-recovery.mjs', () => ({
	withTargetedOpfsRecovery: (storage: unknown) => storage,
}));
jest.mock('@wcpos/utils/logger', () => ({ getLogger: () => ({ error: mockError }) }));

beforeEach(() => {
	jest.resetModules();
	jest.clearAllMocks();
});

it.each(['js-thread', 'worklet'])('selects the %s factory', async (host) => {
	jest.doMock('./native-storage-host', () => ({ NATIVE_STORAGE_HOST: host }));
	const { getNativeNewStorage } = await import('./index');
	const storage = getNativeNewStorage();
	await expect(storage.createStorageInstance({} as never)).resolves.toBe(
		host === 'worklet' ? mockWorkletInstance : mockExpoInstance
	);
	expect(mockExpo).toHaveBeenCalledTimes(host === 'js-thread' ? 1 : 0);
	expect(mockWorklet).toHaveBeenCalledTimes(host === 'worklet' ? 1 : 0);
});

it('uses the JS-thread fallback for all concurrent collections after initialization fails', async () => {
	jest.doMock('./native-storage-host', () => ({ NATIVE_STORAGE_HOST: 'worklet' }));
	mockWorklet.mockRejectedValueOnce(new Error('worker initialization failed'));
	const { getNativeNewStorage } = await import('./index');
	const storage = getNativeNewStorage();
	await expect(
		Promise.all([
			storage.createStorageInstance({} as never),
			storage.createStorageInstance({} as never),
		])
	).resolves.toEqual([mockExpoInstance, mockExpoInstance]);
	expect(mockWorklet).toHaveBeenCalledTimes(1);
	expect(mockExpo).toHaveBeenCalledTimes(1);
	expect(mockError).toHaveBeenCalledWith(
		expect.stringContaining('JS-thread'),
		expect.objectContaining({ code: 'SYNC171', context: { error: 'worker initialization failed' } })
	);
});

it('does not switch roots when an initialized worklet storage rejects a collection open', async () => {
	jest.doMock('./native-storage-host', () => ({ NATIVE_STORAGE_HOST: 'worklet' }));
	mockWorklet.mockResolvedValueOnce({
		createStorageInstance: jest.fn().mockRejectedValue(new Error('collection open failed')),
	});
	const { getNativeNewStorage } = await import('./index');
	await expect(getNativeNewStorage().createStorageInstance({} as never)).rejects.toThrow(
		'collection open failed'
	);
	expect(mockExpo).not.toHaveBeenCalled();
	expect(mockError).not.toHaveBeenCalled();
});
