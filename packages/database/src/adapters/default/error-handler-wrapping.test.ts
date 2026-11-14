const rawStorage = { name: 'raw-storage', createStorageInstance: jest.fn() };

jest.mock('rxdb-premium/plugins/storage-worker', () => ({ getRxStorageWorker: () => rawStorage }), {
	virtual: true,
});
jest.mock('rxdb/plugins/electron', () => ({ getRxStorageIpcRenderer: () => rawStorage }));
jest.mock('rxdb-premium/plugins/storage-sqlite', () => ({
	getRxStorageSQLite: () => rawStorage,
	getSQLiteBasicsExpoSQLiteAsync: () => ({}),
}));
jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));
jest.mock('../storage/sqlite-root', () => ({
	NATIVE_SQLITE_ROOT: { uri: 'document-dir/wcpos-sqlite' },
}));
jest.mock('rxdb/plugins/validate-z-schema', () => {
	if (!__DEV__) throw new Error('Schema validation loaded in production');
	return { wrappedValidateZSchemaStorage: ({ storage }: { storage: unknown }) => storage };
});

const platforms = [
	['web', './index.web'],
	['electron', './index.electron'],
	['native', './index'],
] as const;

it.each([...platforms, ['ephemeral', '../ephemeral']] as const)(
	'%s does not load schema validation in production',
	async (_platform, modulePath) => {
		jest.resetModules();
		const runtime = globalThis as unknown as { __DEV__: boolean; window?: unknown };
		const windowBefore = runtime.window;
		jest.replaceProperty(runtime, '__DEV__', false);
		runtime.window = { ipcRenderer: { invoke: jest.fn() } };
		try {
			const adapter = await import(modulePath);
			expect((adapter.defaultConfig ?? adapter.ephemeralStorageConfig).storage).toBe(
				adapter.storage
			);
		} finally {
			jest.restoreAllMocks();
			if (windowBefore === undefined) delete runtime.window;
			else runtime.window = windowBefore;
		}
	}
);

describe.each(platforms)('%s error-handler wiring', (_platform, modulePath) => {
	const runtime = globalThis as unknown as { window?: unknown };
	const windowBefore = runtime.window;
	const flagBefore = process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE;
	beforeEach(() => {
		jest.resetModules();
		delete process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE;
		runtime.window = { ipcRenderer: { invoke: jest.fn() } };
	});
	afterEach(() => {
		jest.restoreAllMocks();
		if (windowBefore === undefined) delete runtime.window;
		else runtime.window = windowBefore;
		if (flagBefore === undefined) delete process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE;
		else process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE = flagBefore;
	});
	it('exports the real error handler rather than the raw platform storage', async () => {
		const wrapper = await import('../../plugins/wrapped-error-handler-storage');
		const wrap = jest.spyOn(wrapper, 'wrappedErrorHandlerStorage');
		const { storage } = await import(modulePath);
		expect(storage.name).toMatch(/^error-handler-/);
		expect(wrap).toHaveBeenCalledTimes(1);
		expect(storage.createStorageInstance).toBe(wrap.mock.results[0].value.createStorageInstance);
		expect(storage.createStorageInstance).not.toBe(rawStorage.createStorageInstance);
	});
});
