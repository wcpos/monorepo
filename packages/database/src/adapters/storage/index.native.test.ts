import type { SQLiteStorageSettings } from 'rxdb/plugins/storage-sqlite';

const mockEvents: string[] = [];
const mockDb = {
	execAsync: jest.fn(async (sql: string) => {
		mockEvents.push(sql);
	}),
	getFirstAsync: jest.fn(async (sql: string) => {
		mockEvents.push(sql);
		return { journal_mode: 'wal' };
	}),
	closeAsync: jest.fn(async () => {}),
};
const mockOpen = jest.fn(async (..._args: unknown[]) => {
	mockEvents.push('open');
	return mockDb;
});
const mockGetRxStorageSQLite = jest.fn((settings: SQLiteStorageSettings) => ({
	name: 'sqlite',
	settings,
}));
const mockProbe = jest.fn((storage: unknown, layer: string) => ({ storage, layer }));

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: mockOpen }));
jest.mock('expo-file-system', () => ({
	Directory: class {
		uri: string;
		constructor(parent: { uri: string }, name: string) {
			this.uri = `${parent.uri}/${name}`;
		}
	},
	Paths: { document: { uri: 'document-dir' } },
}));
jest.mock('rxdb-premium/plugins/storage-sqlite', () => ({
	// Keep the shipped open/exec helper; only the native driver and storage constructor are fakes.
	getSQLiteBasicsExpoSQLiteAsync: jest.requireActual('rxdb/plugins/storage-sqlite')
		.getSQLiteBasicsExpoSQLiteAsync,
	getRxStorageSQLite: (settings: SQLiteStorageSettings) => mockGetRxStorageSQLite(settings),
}));
jest.mock('../../plugins/storage-timing-probe', () => ({
	...jest.requireActual('../../plugins/storage-timing-probe'),
	withStorageTimingProbe: (storage: unknown, layer: string) => mockProbe(storage, layer),
}));
// Retired constructor can load during the test-first red phase.
jest.mock('rxdb-premium/plugins/storage-filesystem-expo', () => ({
	getRxStorageExpoAsync: () => ({ name: 'old' }),
}));
jest.mock('../../plugins/opfs-targeted-recovery.mjs', () => ({
	withTargetedOpfsRecovery: (storage: unknown) => storage,
}));

describe('native SQLite storage seam', () => {
	const flagBefore = process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE;
	beforeEach(() => {
		jest.resetModules();
		jest.clearAllMocks();
		mockEvents.length = 0;
		delete process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE;
	});
	afterEach(() => {
		if (flagBefore === undefined) delete process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE;
		else process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE = flagBefore;
	});

	async function settings() {
		const { getNativeNewStorage } = await import('./index');
		getNativeNewStorage();
		expect(mockGetRxStorageSQLite).toHaveBeenCalledTimes(1);
		return mockGetRxStorageSQLite.mock.calls[0][0];
	}

	it('uses base64 attachments and the owned root, asserting WAL before NORMAL', async () => {
		const config = await settings();
		expect(config.storeAttachmentsAsBase64String).toBe(true);
		expect(config.sqliteBasics.journalMode).toBe('WAL');
		await expect(config.sqliteBasics.open('wcposusers_v8')).resolves.toBe(mockDb);
		expect(mockOpen).toHaveBeenCalledWith('wcposusers_v8', undefined, 'document-dir/wcpos-sqlite');
		expect(mockEvents).toEqual([
			'open',
			'PRAGMA journal_mode = WAL',
			'PRAGMA journal_mode',
			'PRAGMA synchronous = NORMAL',
		]);
		expect(mockProbe).not.toHaveBeenCalled();
	});

	it('rejects a database that did not enter WAL', async () => {
		mockDb.getFirstAsync.mockResolvedValueOnce({ journal_mode: 'delete' });
		const config = await settings();
		await expect(config.sqliteBasics.open('wcposusers_v8')).rejects.toThrow(/WAL/);
		expect(mockDb.execAsync).not.toHaveBeenCalledWith('PRAGMA synchronous = NORMAL');
	});

	it('wraps only the raw storage when timing is enabled', async () => {
		process.env.EXPO_PUBLIC_WCPOS_STORAGE_PROBE = '1';
		const { getNativeNewStorage } = await import('./index');
		const storage = getNativeNewStorage();
		expect(mockProbe).toHaveBeenCalledWith(mockGetRxStorageSQLite.mock.results[0].value, 'raw');
		expect(storage).toBe(mockProbe.mock.results[0].value);
	});
});
