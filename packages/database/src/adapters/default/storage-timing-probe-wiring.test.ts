/**
 * Pins where the storage timing probe sits on every platform (wayfinder #2141).
 *
 * The probe was wired native-only in f890e064f4; nobody had ever measured what
 * crossing the storage boundary costs on web (a worker) or Electron (IPC). With
 * the bundle-time flag set, each platform's chain must be wrapped twice — 'raw'
 * around the platform storage client and 'wrapped' around the error handler —
 * so the cost of our own wrappers shows as the difference. Without the flag the
 * chain must be exactly what it was, on every platform.
 */
const rawStorage = { name: 'raw-storage' };
const errorHandledStorage = { name: 'error-handled-storage' };
const mockWithStorageTimingProbe = jest.fn((storage: unknown, layer: string) => ({
	name: `probed:${layer}`,
	storage,
}));

jest.mock('rxdb-premium/plugins/storage-worker', () => ({ getRxStorageWorker: () => rawStorage }), {
	virtual: true,
});
jest.mock('rxdb/plugins/electron', () => ({ getRxStorageIpcRenderer: () => rawStorage }));
jest.mock('rxdb-premium/plugins/storage-filesystem-expo', () => ({
	getRxStorageExpoAsync: () => rawStorage,
}));
jest.mock('../../plugins/opfs-targeted-recovery.mjs', () => ({
	withTargetedOpfsRecovery: (storage: unknown) => storage,
}));
jest.mock('../../plugins/wrapped-error-handler-storage', () => ({
	wrappedErrorHandlerStorage: () => errorHandledStorage,
}));
jest.mock('rxdb/plugins/validate-z-schema', () => ({
	wrappedValidateZSchemaStorage: () => ({ name: 'validated-storage' }),
}));
jest.mock('../../plugins/storage-timing-probe', () => ({
	// The real flag, read from process.env at module load, so the test drives it
	// exactly as an Expo bundle would; only the wrapper is observed.
	...jest.requireActual('../../plugins/storage-timing-probe'),
	withStorageTimingProbe: (storage: unknown, layer: string) =>
		mockWithStorageTimingProbe(storage, layer),
}));

// Native is asserted separately, below: it now has two storage hosts, and only the
// js-thread one still builds its whole chain at module load. See that describe block.
const platforms = [
	['web', './index.web'],
	['electron', './index.electron'],
] as const;

describe('storage timing probe wiring per platform adapter', () => {
	const runtime = globalThis as unknown as { window?: unknown };
	const flagBefore = process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE;

	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
		runtime.window = { ipcRenderer: { invoke: jest.fn() } };
	});

	afterEach(() => {
		delete runtime.window;
		if (flagBefore === undefined) delete process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE;
		else process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE = flagBefore;
	});

	describe.each(platforms)('%s', (_platform, modulePath) => {
		it('wraps raw and wrapped layers when EXPO_PUBLIC_WCPOS_STORAGE_PROBE=1', async () => {
			process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE = '1';

			const { storage } = await import(modulePath);

			expect(mockWithStorageTimingProbe.mock.calls).toEqual([
				[rawStorage, 'raw'],
				[errorHandledStorage, 'wrapped'],
			]);
			expect(storage).toEqual({ name: 'probed:wrapped', storage: errorHandledStorage });
		});

		it('leaves the chain untouched when the flag is unset', async () => {
			delete process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE;

			const { storage } = await import(modulePath);

			expect(mockWithStorageTimingProbe).not.toHaveBeenCalled();
			expect(storage).toBe(errorHandledStorage);
		});
	});

	/**
	 * Native has two storage hosts since the worklet runtime landed, and they probe in
	 * different places:
	 *
	 * - 'js-thread' builds the whole chain at module load, exactly as every platform did
	 *   before, so the original two-layer pin still holds.
	 * - 'worklet' (the default) creates the worker lazily inside createStorageInstance, so
	 *   at module load only the 'wrapped' layer exists in the RN process. The raw layer is
	 *   still measured, but it wraps the worker round trip and is labelled
	 *   'raw-worklet-round-trip' — a different cost to the one 'raw' names elsewhere, which
	 *   is the whole point of giving it its own label.
	 *
	 * Asserting a bare two-layer chain for native would therefore pin the js-thread path
	 * while the app ships the worklet one.
	 */
	describe('native', () => {
		it('wraps raw and wrapped layers on the js-thread host', async () => {
			process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE = '1';
			jest.doMock('../storage/native-storage-host', () => ({
				NATIVE_STORAGE_HOST: 'js-thread',
			}));

			const { storage } = await import('./index');

			expect(mockWithStorageTimingProbe.mock.calls).toEqual([
				[rawStorage, 'raw'],
				[errorHandledStorage, 'wrapped'],
			]);
			expect(storage).toEqual({ name: 'probed:wrapped', storage: errorHandledStorage });
		});

		it('wraps only the wrapped layer at module load on the worklet host', async () => {
			process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE = '1';
			jest.doMock('../storage/native-storage-host', () => ({
				NATIVE_STORAGE_HOST: 'worklet',
			}));

			const { storage } = await import('./index');

			expect(mockWithStorageTimingProbe.mock.calls).toEqual([[errorHandledStorage, 'wrapped']]);
			expect(storage).toEqual({ name: 'probed:wrapped', storage: errorHandledStorage });
		});

		it('leaves the chain untouched when the flag is unset', async () => {
			delete process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE;

			const { storage } = await import('./index');

			expect(mockWithStorageTimingProbe).not.toHaveBeenCalled();
			expect(storage).toBe(errorHandledStorage);
		});
	});
});
