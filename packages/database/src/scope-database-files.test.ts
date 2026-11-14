const DRAINABLE = 'pos_v5_0123456789ab_s1_c2';

const mockEntries = [
	DRAINABLE,
	`${DRAINABLE}-wal`,
	`${DRAINABLE}-shm`,
	// Another scope, and a name that merely shares the prefix: both must survive.
	'pos_v5_0123456789ab_s1_c22',
	'pos_v6_0123456789ab_s1_c2',
].map((name) => ({ name, delete: jest.fn() }));

let mockRootExists = true;

class MockDirectory {
	uri: string;

	constructor(...parts: ({ uri?: string } | string)[]) {
		this.uri = parts
			.map((part) => (typeof part === 'string' ? part : (part.uri ?? '')))
			.filter(Boolean)
			.join('/');
	}

	get exists() {
		return mockRootExists;
	}

	list() {
		return this.uri.endsWith('wcpos-sqlite') ? mockEntries : [];
	}
}

jest.mock('expo-file-system', () => ({
	Directory: MockDirectory,
	Paths: { document: { uri: 'document-dir' } },
}));

describe('native scope database files', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockRootExists = true;
	});

	it('answers existence from a listing of the SQLite root, never by opening', async () => {
		const { scopeDatabaseFiles } = await import('./scope-database-files');
		await expect(scopeDatabaseFiles!.exists(DRAINABLE)).resolves.toBe(true);
		await expect(scopeDatabaseFiles!.exists('pos_v5_0123456789ab_s9_c2')).resolves.toBe(false);
		mockRootExists = false;
		await expect(scopeDatabaseFiles!.exists(DRAINABLE)).resolves.toBe(false);
	});

	it('lists every database by name, without sidecars, and nothing when the root is missing', async () => {
		const { scopeDatabaseFiles } = await import('./scope-database-files');
		await expect(scopeDatabaseFiles!.list()).resolves.toEqual([
			DRAINABLE,
			'pos_v5_0123456789ab_s1_c22',
			'pos_v6_0123456789ab_s1_c2',
		]);
		mockRootExists = false;
		await expect(scopeDatabaseFiles!.list()).resolves.toEqual([]);
	});

	it('deletes the database file and its sidecars, and nothing else', async () => {
		const { scopeDatabaseFiles } = await import('./scope-database-files');
		await expect(scopeDatabaseFiles!.remove(DRAINABLE)).resolves.toBe(3);
		expect(
			mockEntries.filter((entry) => entry.delete.mock.calls.length > 0).map(({ name }) => name)
		).toEqual([DRAINABLE, `${DRAINABLE}-wal`, `${DRAINABLE}-shm`]);
	});

	it('web and Electron expose no file access: the drain opens to check there', async () => {
		const web = await import('./scope-database-files.web');
		const electron = await import('./scope-database-files.electron');
		expect(web.scopeDatabaseFiles).toBeNull();
		expect(electron.scopeDatabaseFiles).toBeNull();
	});
});
